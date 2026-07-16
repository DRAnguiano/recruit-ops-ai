import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/database/migrate';
import * as schema from '../src/database/schema';
import { createEphemeralDatabase, EphemeralDatabase } from './helpers';

/** Postgres 23505 = unique_violation; drizzle lo envuelve en DrizzleQueryError.cause. */
async function expectUniqueViolation(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as Error & { cause?: { code?: string } },
  );
  expect(error, 'se esperaba un rechazo por unique_violation').not.toBeNull();
  expect(error?.cause?.code).toBe('23505');
}

describe('persistencia (data-persistence)', () => {
  let ephemeral: EphemeralDatabase;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    ephemeral = await createEphemeralDatabase();
    client = postgres(ephemeral.url);
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
    await ephemeral.drop();
  });

  it('las migraciones son idempotentes (segunda pasada no falla)', async () => {
    await expect(runMigrations(ephemeral.url)).resolves.toBeUndefined();
  });

  it('el horario laboral por defecto queda sembrado con TZ IANA', async () => {
    const rows = await db.select().from(schema.workSchedules);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.timezone).toBe('America/Mexico_City');
    expect(rows[0]?.workDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('rechaza dos personas con el mismo teléfono E.164', async () => {
    await db.insert(schema.people).values({ phone: '+528711234567', name: 'A' });
    await expectUniqueViolation(
      db.insert(schema.people).values({ phone: '+528711234567', name: 'B' }),
    );
  });

  it('rechaza dos mensajes con el mismo canal + external_message_id (idempotencia)', async () => {
    const [person] = await db
      .insert(schema.people)
      .values({ phone: '+528719999999' })
      .returning();
    const [conversation] = await db
      .insert(schema.conversations)
      .values({ personId: person!.id, channel: 'whatsapp' })
      .returning();

    const message = {
      conversationId: conversation!.id,
      channel: 'whatsapp',
      externalMessageId: 'wamid.TEST-1',
      direction: 'inbound',
      body: 'hola',
      rawPayload: { source: 'test' },
      sentAt: new Date(),
    };
    await db.insert(schema.messages).values(message);
    await expectUniqueViolation(db.insert(schema.messages).values(message));
  });
});
