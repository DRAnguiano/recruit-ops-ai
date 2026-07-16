import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NormalizedInboundMessage } from '../src/channels/channel-adapter';
import { MessageIngestionService } from '../src/channels/message-ingestion.service';
import * as schema from '../src/database/schema';
import { buildIngestionService } from './ingestion.spec';
import { createEphemeralDatabase, EphemeralDatabase } from './helpers';

let seq = 0;
function msg(overrides: Partial<NormalizedInboundMessage>): NormalizedInboundMessage {
  seq += 1;
  return {
    channel: 'whatsapp',
    kind: 'text',
    externalMessageId: `wamid.LP${seq}`,
    externalUserId: '5218710000001',
    phoneE164: '+5218710000001',
    senderName: 'Pipeline Test',
    body: 'hola',
    sentAt: new Date('2026-07-15T15:00:00Z'), // miércoles 09:00 CDMX (hábil)
    raw: { test: true },
    ...overrides,
  };
}

async function leadOf(db: ReturnType<typeof drizzle<typeof schema>>, phone: string) {
  const person = await db.query.people.findFirst({ where: eq(schema.people.phone, phone) });
  return db.query.leads.findFirst({ where: eq(schema.leads.personId, person!.id) });
}

describe('pipeline de leads (lead-pipeline)', () => {
  let ephemeral: EphemeralDatabase;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: MessageIngestionService;

  beforeAll(async () => {
    ephemeral = await createEphemeralDatabase();
    client = postgres(ephemeral.url);
    db = drizzle(client, { schema });
    service = buildIngestionService(db);
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
    await ephemeral.drop();
  });

  it('primer mensaje crea lead con datos de llegada en la TZ del schedule', async () => {
    await service.ingest([msg({ body: 'buenas tardes' })]);
    const lead = await leadOf(db, '+5218710000001');
    expect(lead).toMatchObject({
      status: 'new',
      origin: 'organic',
      inWorkHours: true,
      arrivalHour: 9,
      arrivalDay: 3,
      classification: 'other',
    });
    expect(lead?.firstMessageAt?.toISOString()).toBe('2026-07-15T15:00:00.000Z');
  });

  it('clasificación acumulativa: mejora con "tráiler" y no regresa con "ok gracias"', async () => {
    await service.ingest([msg({ body: 'quiero manejar TRÁILER foráneo' })]);
    let lead = await leadOf(db, '+5218710000001');
    expect(lead?.classification).toBe('vacancy');
    expect(lead?.detectedVacancyType).toBe('quinta_rueda');

    await service.ingest([msg({ body: 'ok gracias' })]);
    lead = await leadOf(db, '+5218710000001');
    expect(lead?.classification).toBe('vacancy');
    expect(lead?.detectedVacancyType).toBe('quinta_rueda');

    const classified = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'lead.classified'));
    expect(classified).toHaveLength(1);
    expect(await db.select().from(schema.leads)).toHaveLength(1);
  });

  it('la corrección humana nunca es pisada por el pipeline', async () => {
    const lead = await leadOf(db, '+5218710000001');
    await db
      .update(schema.leads)
      .set({ classification: 'internal_hr', detectedVacancyType: null, classificationSource: 'human' })
      .where(eq(schema.leads.id, lead!.id));

    await service.ingest([msg({ body: 'quiero la escuelita para aprender' })]);
    const after = await leadOf(db, '+5218710000001');
    expect(after?.classification).toBe('internal_hr');
    expect(after?.detectedVacancyType).toBeNull();
  });

  it('referral con campaña conocida: atribuye campaign_id, origin paid y evento', async () => {
    const [campaign] = await db
      .insert(schema.campaigns)
      .values({ externalId: 'AD-KNOWN-1', name: 'Vacante 5ta Rueda Julio', source: 'meta_api' })
      .returning();

    await service.ingest([
      msg({
        externalUserId: '5218710000002',
        phoneE164: '+5218710000002',
        body: 'Hola, vi esto en Facebook',
        referral: { sourceId: 'AD-KNOWN-1', sourceType: 'ad' },
      }),
    ]);

    const lead = await leadOf(db, '+5218710000002');
    expect(lead?.campaignId).toBe(campaign!.id);
    expect(lead?.origin).toBe('paid');

    const attributed = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'lead.attributed'));
    expect(attributed).toHaveLength(1);
  });

  it('referral sin campaña local: guarda el payload crudo para re-atribución', async () => {
    await service.ingest([
      msg({
        externalUserId: '5218710000003',
        phoneE164: '+5218710000003',
        referral: { sourceId: 'AD-UNKNOWN-9', sourceUrl: 'https://fb.me/x' },
      }),
    ]);
    const lead = await leadOf(db, '+5218710000003');
    expect(lead?.campaignId).toBeNull();
    expect(lead?.origin).toBe('paid');
    expect(lead?.referralPayload).toMatchObject({ sourceId: 'AD-UNKNOWN-9' });
  });

  it('sin referral el origen queda organic (nunca atribución inventada)', async () => {
    const lead = await leadOf(db, '+5218710000001');
    expect(lead?.origin).toBe('organic');
    expect(lead?.campaignId).toBeNull();
  });

  it('conversación con 21+ días de inactividad se cierra y el mensaje abre otra', async () => {
    // Última actividad del person 1: 2026-07-15. Mensaje 30 días después:
    await service.ingest([msg({ body: 'sigo interesado', sentAt: new Date('2026-08-14T16:00:00Z') })]);

    const person = await db.query.people.findFirst({
      where: eq(schema.people.phone, '+5218710000001'),
    });
    const convs = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.personId, person!.id));
    expect(convs).toHaveLength(2);
    expect(convs.filter((c) => c.status === 'closed')).toHaveLength(1);
    expect(convs.find((c) => c.status === 'closed')?.closedAt).toBeInstanceOf(Date);
    expect(convs.filter((c) => c.status === 'open')).toHaveLength(1);

    const closedEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'conversation.closed'));
    expect(closedEvents).toHaveLength(1);
    expect(closedEvents[0]?.payload).toMatchObject({ reason: 'inactivity' });
  });

  it('mensaje duplicado no re-ejecuta el pipeline', async () => {
    const before = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'lead.created'));

    // Reenvía el último mensaje (mismo external_message_id).
    await service.ingest([
      msg({ externalMessageId: `wamid.LP${seq}`, sentAt: new Date('2026-08-14T16:00:00Z') }),
    ]);

    const after = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'lead.created'));
    expect(after).toHaveLength(before.length);
  });
});
