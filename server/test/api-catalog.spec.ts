import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp } from './helpers';

async function post<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe('API de catálogos (catalog-api)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('CRUD de vacantes con defaults y auditoría actor=user', async () => {
    // company y circuit se validan contra catálogo (configurable-catalogs).
    await post(`${t.baseUrl}/api/companies`, { name: 'Transmontes', label: 'Transmontes' });
    await post(`${t.baseUrl}/api/circuits`, { name: 'Tramo Torreón', label: 'Tramo Torreón' });
    const created = await post<{ id: string; status: string }>(`${t.baseUrl}/api/vacancies`, {
      type: 'quinta_rueda',
      circuit: 'Tramo Torreón',
      modality: 'foreign',
      company: 'Transmontes',
      quota: 5,
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('open');

    const patched = await fetch(`${t.baseUrl}/api/vacancies/${created.body.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quota: 8, status: 'paused' }),
    });
    expect(((await patched.json()) as { quota: number }).quota).toBe(8);

    const list = await fetch(`${t.baseUrl}/api/vacancies`);
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const del = await fetch(`${t.baseUrl}/api/vacancies/${created.body.id}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);

    const events = await t.db.query.domainEvents.findMany();
    for (const type of ['vacancy.created', 'vacancy.updated', 'vacancy.deleted']) {
      const event = events.find((e) => e.type === type);
      expect(event?.actor).toBe('user');
    }
  });

  it('DELETE de fila referenciada falla tipado y la fila permanece', async () => {
    const agent = await post<{ id: string }>(`${t.baseUrl}/api/agents`, { name: 'Adriana' });
    const [person] = await t.db
      .insert(schema.people)
      .values({ phone: '+5218719999999' })
      .returning();
    await t.db.insert(schema.conversations).values({
      personId: person!.id,
      channel: 'whatsapp',
      assignedAgentId: agent.body.id,
    });

    const del = await fetch(`${t.baseUrl}/api/agents/${agent.body.id}`, { method: 'DELETE' });
    expect(del.status).toBe(409);
    expect(((await del.json()) as { code: string }).code).toBe('RESOURCE_REFERENCED');

    const still = await t.db.query.agents.findFirst();
    expect(still?.id).toBe(agent.body.id);
  });

  it('work schedule valida TZ IANA y horas HH:MM', async () => {
    const bad = await post(`${t.baseUrl}/api/work-schedules`, {
      name: 'Turno inválido',
      workDays: [1, 2],
      startTime: '25:00',
      endTime: '17:00',
      timezone: 'America/Ciudad_Inventada',
    });
    expect(bad.status).toBe(400);

    const ok = await post<{ id: string; timezone: string }>(`${t.baseUrl}/api/work-schedules`, {
      name: 'Turno sabatino',
      workDays: [6],
      startTime: '08:00',
      endTime: '14:00',
      timezone: 'America/Monterrey',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.timezone).toBe('America/Monterrey');
  });

  it('settings: GET expone defaults, PUT valida y persiste, clave desconocida 404', async () => {
    const initial = await fetch(`${t.baseUrl}/api/settings`);
    expect(((await initial.json()) as Record<string, unknown>).conversation_inactivity_days).toBe(
      21,
    );

    const put = await fetch(`${t.baseUrl}/api/settings/conversation_inactivity_days`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 30 }),
    });
    expect(put.status).toBe(200);

    const after = await fetch(`${t.baseUrl}/api/settings`);
    expect(((await after.json()) as Record<string, unknown>).conversation_inactivity_days).toBe(
      30,
    );

    const invalid = await fetch(`${t.baseUrl}/api/settings/conversation_inactivity_days`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'muchos' }),
    });
    expect(invalid.status).toBe(400);

    const unknown = await fetch(`${t.baseUrl}/api/settings/clave_inventada`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
    expect(unknown.status).toBe(404);
  });

  it('bulk de operadores: doble import idempotente por empNo', async () => {
    const items = [
      { empNo: 'E-1', company: 'Transmontes', name: 'Pedro', normalizedPhones: ['8711111111'] },
      { empNo: 'E-2', company: 'Transmontes', name: 'Luis' },
    ];
    const first = await post<{ created: number; updated: number }>(
      `${t.baseUrl}/api/operators/bulk`,
      { items },
    );
    expect(first.body).toEqual({ created: 2, updated: 0 });

    const second = await post<{ created: number; updated: number }>(
      `${t.baseUrl}/api/operators/bulk`,
      { items: [{ ...items[0], name: 'Pedro Gómez' }, items[1]] },
    );
    expect(second.body).toEqual({ created: 0, updated: 2 });

    const rows = await t.db.query.operators.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.empNo === 'E-1')?.name).toBe('Pedro Gómez');
  });

  it('bulk de campañas: upsert por externalId o name+isoWeek con source=csv', async () => {
    const items = [
      { externalId: 'EXT-9', name: 'Campaña Meta', spend: 1200.5 },
      { name: 'Campaña CSV', isoWeek: '2026-W28', spend: 300 },
    ];
    const first = await post<{ created: number; updated: number }>(
      `${t.baseUrl}/api/campaigns/bulk`,
      { items },
    );
    expect(first.body).toEqual({ created: 2, updated: 0 });

    const second = await post<{ created: number; updated: number }>(
      `${t.baseUrl}/api/campaigns/bulk`,
      { items: [{ ...items[1], spend: 450 }] },
    );
    expect(second.body).toEqual({ created: 0, updated: 1 });

    const rows = await t.db.query.campaigns.findMany();
    expect(rows).toHaveLength(2);
    const csv = rows.find((r) => r.isoWeek === '2026-W28');
    expect(csv?.source).toBe('csv');
    expect(csv?.spend).toBe('450.00');
    expect(csv?.currency).toBe('USD');

    const missingKey = await post(`${t.baseUrl}/api/campaigns/bulk`, {
      items: [{ name: 'Sin llave' }],
    });
    expect(missingKey.status).toBe(400);
  });
});
