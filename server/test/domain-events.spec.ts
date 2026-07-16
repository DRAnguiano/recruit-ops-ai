import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { DomainEventsService } from '../src/events/domain-events.service';
import { createEphemeralDatabase, EphemeralDatabase } from './helpers';

describe('event log (domain-events)', () => {
  let ephemeral: EphemeralDatabase;
  let client: ReturnType<typeof postgres>;
  let service: DomainEventsService;

  beforeAll(async () => {
    ephemeral = await createEphemeralDatabase();
    client = postgres(ephemeral.url);
    service = new DomainEventsService(drizzle(client, { schema }));
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
    await ephemeral.drop();
  });

  it('append persiste el evento con todos los campos y timestamp UTC', async () => {
    const event = await service.append({
      type: 'lead.created',
      aggregateType: 'lead',
      aggregateId: 'lead-1',
      actor: 'channel',
      payload: { channel: 'whatsapp' },
    });
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.type).toBe('lead.created');
    expect(event.actor).toBe('channel');
    expect(event.payload).toEqual({ channel: 'whatsapp' });
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('UPDATE y DELETE sobre domain_events son rechazados por el trigger', async () => {
    await expect(
      client`UPDATE domain_events SET type = 'hacked' WHERE type = 'lead.created'`,
    ).rejects.toThrow(/append-only/);
    await expect(client`DELETE FROM domain_events`).rejects.toThrow(/append-only/);
  });

  it('la consulta por rango filtra y ordena por occurred_at ascendente', async () => {
    const base = Date.parse('2026-07-01T12:00:00Z');
    for (const [i, offsetMin] of [30, 10, 20].entries()) {
      await service.append({
        type: 'test.ordered',
        aggregateType: 'test',
        aggregateId: `agg-${i}`,
        actor: 'system',
        occurredAt: new Date(base + offsetMin * 60_000),
      });
    }

    const events = await service.query({
      type: 'test.ordered',
      from: new Date(base),
      to: new Date(base + 60 * 60_000),
    });
    expect(events).toHaveLength(3);
    const times = events.map((e) => e.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));

    const narrow = await service.query({
      type: 'test.ordered',
      to: new Date(base + 15 * 60_000),
    });
    expect(narrow).toHaveLength(1);
  });

  it('el trigger existe en la base (no solo por convención de repositorio)', async () => {
    const rows = await client`
      SELECT tgname FROM pg_trigger WHERE tgname = 'domain_events_append_only'`;
    expect(rows).toHaveLength(1);
    void sql; // drizzle sql importado para posibles extensiones del test
  });
});
