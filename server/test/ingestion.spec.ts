import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NormalizedInboundMessage } from '../src/channels/channel-adapter';
import { MessageIngestionService } from '../src/channels/message-ingestion.service';
import * as schema from '../src/database/schema';
import { DomainEventsService } from '../src/events/domain-events.service';
import { ClassificationRulesService } from '../src/leads/classification-rules.service';
import { LeadPipelineService } from '../src/leads/lead-pipeline.service';
import { SchedulesService } from '../src/schedules/schedules.service';
import { SettingsService } from '../src/settings/settings.service';
import { createEphemeralDatabase, EphemeralDatabase } from './helpers';

export function buildIngestionService(
  db: ReturnType<typeof drizzle<typeof schema>>,
): MessageIngestionService {
  const events = new DomainEventsService(db);
  const pipeline = new LeadPipelineService(
    db,
    events,
    new ClassificationRulesService(db),
    new SchedulesService(db),
  );
  return new MessageIngestionService(db, events, new SettingsService(db), pipeline);
}

function inboundMessage(overrides: Partial<NormalizedInboundMessage>): NormalizedInboundMessage {
  return {
    channel: 'whatsapp',
    kind: 'text',
    externalMessageId: `wamid.${Math.random().toString(36).slice(2)}`,
    externalUserId: '5218711111111',
    phoneE164: '+5218711111111',
    senderName: 'Test',
    body: 'hola',
    sentAt: new Date(),
    raw: { test: true },
    ...overrides,
  };
}

describe('ingestión (message-ingestion)', () => {
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

  it('primer contacto: crea persona, identidad, conversación, lead y sus eventos', async () => {
    await service.ingest([inboundMessage({ externalMessageId: 'wamid.FIRST' })]);

    expect(await db.select().from(schema.people)).toHaveLength(1);
    expect(await db.select().from(schema.channelIdentities)).toHaveLength(1);
    expect(await db.select().from(schema.conversations)).toHaveLength(1);
    expect(await db.select().from(schema.leads)).toHaveLength(1);

    const types = (await db.select().from(schema.domainEvents)).map((e) => e.type).sort();
    // body 'hola' no matchea ninguna regla → no hay lead.classified.
    expect(types).toEqual([
      'conversation.started',
      'lead.created',
      'message.received',
      'person.created',
    ]);
  });

  it('mensaje siguiente del mismo remitente: reutiliza todo y solo emite message.received', async () => {
    await service.ingest([inboundMessage({ externalMessageId: 'wamid.SECOND' })]);

    expect(await db.select().from(schema.people)).toHaveLength(1);
    expect(await db.select().from(schema.conversations)).toHaveLength(1);
    expect(await db.select().from(schema.messages)).toHaveLength(2);

    const events = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'message.received'));
    expect(events).toHaveLength(2);
    const created = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'person.created'));
    expect(created).toHaveLength(1);
  });

  it('entrega duplicada: sin filas ni eventos nuevos', async () => {
    const duplicate = inboundMessage({ externalMessageId: 'wamid.SECOND' });
    await service.ingest([duplicate]);

    expect(await db.select().from(schema.messages)).toHaveLength(2);
    const events = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'message.received'));
    expect(events).toHaveLength(2);
  });

  it('mismo teléfono en canal nuevo: vincula la identidad a la persona existente', async () => {
    await service.ingest([
      inboundMessage({
        channel: 'telegram',
        externalMessageId: '999_1',
        externalUserId: '999',
        phoneE164: '+5218711111111',
      }),
    ]);

    expect(await db.select().from(schema.people)).toHaveLength(1);
    const identities = await db.select().from(schema.channelIdentities);
    expect(identities).toHaveLength(2);
    expect(new Set(identities.map((i) => i.personId)).size).toBe(1);
    // Canal nuevo → conversación nueva aunque sea la misma persona.
    expect(await db.select().from(schema.conversations)).toHaveLength(2);
  });

  it('remitente sin teléfono ni identidad previa: crea persona sin phone', async () => {
    await service.ingest([
      inboundMessage({
        channel: 'telegram',
        externalMessageId: '555_1',
        externalUserId: '555',
        phoneE164: undefined,
      }),
    ]);

    const persons = await db.select().from(schema.people);
    expect(persons).toHaveLength(2);
    expect(persons.some((p) => p.phone === null)).toBe(true);
    // Cada persona nueva garantiza su lead.
    expect(await db.select().from(schema.leads)).toHaveLength(2);
  });

  it('actualiza last_message_at de la conversación', async () => {
    const sentAt = new Date('2026-07-15T10:00:00Z');
    await service.ingest([
      inboundMessage({ externalMessageId: 'wamid.THIRD', sentAt }),
    ]);
    const conversation = await db.query.conversations.findFirst({
      where: eq(schema.conversations.channel, 'whatsapp'),
    });
    expect(conversation?.lastMessageAt?.toISOString()).toBe(sentAt.toISOString());
  });
});
