import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { LeadPipelineService } from '../src/leads/lead-pipeline.service';
import { bootTestApp, TestApp } from './helpers';

interface PageBody<T = Record<string, unknown>> {
  items: T[];
  nextCursor: string | null;
}

interface LeadBody {
  id: string;
  status: string;
  classification: string;
  detectedVacancyType: string | null;
  classificationSource: string;
  origin: string | null;
  notes: string | null;
  assignedAgentId: string | null;
  person: { phone: string | null; name: string | null };
  campaign: { id: string; name: string } | null;
  operator: { id: string; empNo: string } | null;
}

describe('API de leads (leads-api)', () => {
  let t: TestApp;
  let leadIds: string[] = [];
  let personIds: string[] = [];
  let campaignId: string;
  let agentId: string;
  let operatorId: string;

  beforeAll(async () => {
    t = await bootTestApp();

    const [campaign] = await t.db
      .insert(schema.campaigns)
      .values({ externalId: 'CAMP-EXT-1', name: 'Traileros Julio', source: 'meta_api' })
      .returning();
    campaignId = campaign!.id;

    const [agent] = await t.db.insert(schema.agents).values({ name: 'Adriana' }).returning();
    agentId = agent!.id;

    const [operator] = await t.db
      .insert(schema.operators)
      .values({ empNo: 'EMP-001', company: 'Transmontes', name: 'Pedro Gómez' })
      .returning();
    operatorId = operator!.id;

    // 3 leads con distintos estados/orígenes; el más nuevo primero en listados.
    const seeds = [
      { phone: '+5218711111111', status: 'new', origin: 'organic', campaign: false },
      { phone: '+5218722222222', status: 'in_progress', origin: 'paid', campaign: true },
      { phone: '+5218733333333', status: 'new', origin: 'paid', campaign: true },
    ];
    for (const [i, seed] of seeds.entries()) {
      const [person] = await t.db
        .insert(schema.people)
        .values({ phone: seed.phone, name: `Lead ${i}` })
        .returning();
      personIds.push(person!.id);
      const [lead] = await t.db
        .insert(schema.leads)
        .values({
          personId: person!.id,
          status: seed.status,
          origin: seed.origin,
          campaignId: seed.campaign ? campaignId : null,
          classification: 'vacancy',
          detectedVacancyType: i === 1 ? 'quinta_rueda' : null,
          firstMessageAt: new Date(Date.parse('2026-07-10T12:00:00Z') + i * 60_000),
          createdAt: new Date(Date.parse('2026-07-10T12:00:00Z') + i * 60_000),
        })
        .returning();
      leadIds.push(lead!.id);
    }
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('GET /api/leads lista con persona y filtros de bandeja', async () => {
    const res = await fetch(`${t.baseUrl}/api/leads`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageBody<LeadBody>;
    expect(body.items).toHaveLength(3);
    expect(body.items[0]!.person.phone).toBe('+5218733333333'); // createdAt DESC

    const news = await fetch(`${t.baseUrl}/api/leads?status=new`);
    expect(((await news.json()) as PageBody).items).toHaveLength(2);

    const paid = await fetch(`${t.baseUrl}/api/leads?origin=paid&campaignId=${campaignId}`);
    expect(((await paid.json()) as PageBody).items).toHaveLength(2);

    const typed = await fetch(`${t.baseUrl}/api/leads?detectedVacancyType=quinta_rueda`);
    expect(((await typed.json()) as PageBody).items).toHaveLength(1);

    const ranged = await fetch(
      `${t.baseUrl}/api/leads?firstMessageFrom=2026-07-10T12:01:30Z`,
    );
    expect(((await ranged.json()) as PageBody).items).toHaveLength(1);
  });

  it('pagina por cursor sin duplicados', async () => {
    const first = await fetch(`${t.baseUrl}/api/leads?limit=2`);
    const page1 = (await first.json()) as PageBody<LeadBody>;
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const second = await fetch(
      `${t.baseUrl}/api/leads?limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
    );
    const page2 = (await second.json()) as PageBody<LeadBody>;
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((l) => l.id)).size).toBe(3);
  });

  it('el detalle incluye atribución de campaña y métricas', async () => {
    const res = await fetch(`${t.baseUrl}/api/leads/${leadIds[1]}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeadBody & { inWorkHours: boolean | null };
    expect(body.campaign).toEqual({ id: campaignId, name: 'Traileros Julio' });
    expect(body.origin).toBe('paid');
    expect(body.detectedVacancyType).toBe('quinta_rueda');

    const missing = await fetch(`${t.baseUrl}/api/leads/00000000-0000-4000-8000-000000000000`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe('LEAD_NOT_FOUND');
  });

  it('PATCH avanza status/notas/agente y emite lead.updated actor=user', async () => {
    const res = await fetch(`${t.baseUrl}/api/leads/${leadIds[0]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', notes: 'Llamar mañana', assignedAgentId: agentId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeadBody;
    expect(body.status).toBe('in_progress');
    expect(body.notes).toBe('Llamar mañana');
    expect(body.assignedAgentId).toBe(agentId);
    // Cambios operativos no tocan la fuente de clasificación.
    expect(body.classificationSource).toBe('system');

    const events = await t.db.query.domainEvents.findMany();
    const updated = events.find((e) => e.type === 'lead.updated');
    expect(updated?.actor).toBe('user');
    expect((updated?.payload as { changes: { status: string } }).changes.status).toBe(
      'in_progress',
    );
  });

  it('status inválido es 400 y el lead no cambia; agente inexistente 404', async () => {
    const invalid = await fetch(`${t.baseUrl}/api/leads/${leadIds[0]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'contratadisimo' }),
    });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { code: string }).code).toBe('VALIDATION_ERROR');

    const detail = await fetch(`${t.baseUrl}/api/leads/${leadIds[0]}`);
    expect(((await detail.json()) as LeadBody).status).toBe('in_progress');

    const badAgent = await fetch(`${t.baseUrl}/api/leads/${leadIds[0]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedAgentId: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(badAgent.status).toBe(404);
    expect(((await badAgent.json()) as { code: string }).code).toBe('AGENT_NOT_FOUND');
  });

  it('la corrección humana de clasificación no es pisada por el pipeline', async () => {
    const res = await fetch(`${t.baseUrl}/api/leads/${leadIds[0]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ classification: 'internal_hr', detectedVacancyType: null }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeadBody;
    expect(body.classification).toBe('internal_hr');
    expect(body.classificationSource).toBe('human');

    // Mensaje nuevo con keywords claras de vacante quinta rueda.
    const pipeline = t.app.get(LeadPipelineService);
    await pipeline.processMessage({
      personId: personIds[0]!,
      conversationId: '00000000-0000-4000-8000-000000000001',
      messageId: '00000000-0000-4000-8000-000000000002',
      inbound: {
        channel: 'whatsapp',
        kind: 'text',
        externalMessageId: 'ext-human-override',
        externalUserId: '5218711111111',
        body: 'me interesa la vacante de quinta rueda para trailer',
        sentAt: new Date(),
        raw: {},
      },
    });

    const after = await fetch(`${t.baseUrl}/api/leads/${leadIds[0]}`);
    const afterBody = (await after.json()) as LeadBody;
    expect(afterBody.classification).toBe('internal_hr');
    expect(afterBody.classificationSource).toBe('human');
    expect(afterBody.detectedVacancyType).toBeNull();
  });

  it('vincula y desvincula operador con evento; operador inexistente es 404', async () => {
    const res = await fetch(`${t.baseUrl}/api/leads/${leadIds[1]}/operator`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as LeadBody;
    expect(body.operator?.empNo).toBe('EMP-001');

    const events = await t.db.query.domainEvents.findMany();
    const matched = events.find((e) => e.type === 'lead.operator_matched');
    expect(matched?.actor).toBe('user');

    const unknown = await fetch(`${t.baseUrl}/api/leads/${leadIds[1]}/operator`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorId: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { code: string }).code).toBe('OPERATOR_NOT_FOUND');

    const unlink = await fetch(`${t.baseUrl}/api/leads/${leadIds[1]}/operator`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorId: null }),
    });
    expect(((await unlink.json()) as LeadBody).operator).toBeNull();
  });
});
