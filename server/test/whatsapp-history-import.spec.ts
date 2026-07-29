import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp } from './helpers';

interface HistoricalMessage {
  externalMessageId: string;
  externalUserId: string;
  phoneE164?: string;
  body?: string;
  sentAt: string;
  referral?: { sourceId: string; sourceType?: string };
}

function batch(agent: string, messages: HistoricalMessage[]) {
  return { agent, messages };
}

/** Fake del bot: si algo le llegara, sería un fallo de la regla "histórico nunca dispara bot". */
function startFakeBot(): Promise<{ server: Server; baseUrl: string; calls: number[] }> {
  const calls: number[] = [];
  const server = createServer((req, res) => {
    calls.push(Date.now());
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, calls });
    });
  });
}

async function post<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe('importación de historial de WhatsApp (whatsapp-history-import)', () => {
  let t: TestApp;
  let fakeBot: { server: Server; baseUrl: string; calls: number[] };

  beforeAll(async () => {
    fakeBot = await startFakeBot();
    t = await bootTestApp({
      BOT_WEBHOOK_URL: `${fakeBot.baseUrl}/bot-webhook`,
      BOT_SHARED_SECRET: 'whatsapp-history-import-secret-0',
    });
  });

  afterAll(async () => {
    await t.cleanup();
    fakeBot.server.close();
  });

  it('un lote crea persona, conversación y lead con las fechas reales', async () => {
    const res = await post<{
      messagesReceived: number;
      messagesIngested: number;
      duplicates: number;
      leadsAssigned: number;
    }>(`${t.baseUrl}/api/import/whatsapp-history`, {
      agent: 'Hernan',
      messages: [
        {
          externalMessageId: 'wa-hist:5218111111111:1000000000:aa',
          externalUserId: '5218111111111',
          phoneE164: '+5218111111111',
          body: 'Hola, me interesa la vacante',
          sentAt: '2026-06-18T18:30:00.000Z',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      messagesReceived: 1,
      messagesIngested: 1,
      duplicates: 0,
      leadsAssigned: 1,
    });

    const person = await t.db.query.people.findFirst({
      where: eq(schema.people.phone, '+5218111111111'),
    });
    expect(person).toBeTruthy();

    const conversation = await t.db.query.conversations.findFirst({
      where: eq(schema.conversations.personId, person!.id),
    });
    expect(conversation?.attentionMode).toBe('human');

    const message = await t.db.query.messages.findFirst({
      where: eq(schema.messages.externalMessageId, 'wa-hist:5218111111111:1000000000:aa'),
    });
    expect(message?.sentAt.toISOString()).toBe('2026-06-18T18:30:00.000Z');

    const lead = await t.db.query.leads.findFirst({ where: eq(schema.leads.personId, person!.id) });
    expect(lead?.assignedAgentId).toBeTruthy();

    const agent = await t.db.query.agents.findFirst({ where: eq(schema.agents.name, 'Hernan') });
    expect(lead?.assignedAgentId).toBe(agent!.id);
  });

  it('reimportar el mismo lote es idempotente: sin filas nuevas', async () => {
    const before = await t.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.externalMessageId, 'wa-hist:5218111111111:1000000000:aa'));
    expect(before).toHaveLength(1);

    const res = await post<{ messagesIngested: number; duplicates: number }>(
      `${t.baseUrl}/api/import/whatsapp-history`,
      batch('Hernan', [
        {
          externalMessageId: 'wa-hist:5218111111111:1000000000:aa',
          externalUserId: '5218111111111',
          phoneE164: '+5218111111111',
          body: 'Hola, me interesa la vacante',
          sentAt: '2026-06-18T18:30:00.000Z',
        },
      ]),
    );
    expect(res.status).toBe(201);
    expect(res.body.messagesIngested).toBe(0);
    expect(res.body.duplicates).toBe(1);

    const after = await t.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.externalMessageId, 'wa-hist:5218111111111:1000000000:aa'));
    expect(after).toHaveLength(1);
  });

  it('la ingestión histórica nunca dispara al bot', async () => {
    await post(
      `${t.baseUrl}/api/import/whatsapp-history`,
      batch('Hernan', [
        {
          externalMessageId: 'wa-hist:5218122222222:1000000100:bb',
          externalUserId: '5218122222222',
          phoneE164: '+5218122222222',
          body: 'Otro candidato histórico',
          sentAt: '2026-06-19T18:30:00.000Z',
        },
      ]),
    );
    // Margen para que un job (si se llegara a encolar por error) se procese.
    await new Promise((r) => setTimeout(r, 700));
    expect(fakeBot.calls).toHaveLength(0);
  });

  it('no asigna agente a un lead que ya tenía uno', async () => {
    const person = await t.db.query.people.findFirst({
      where: eq(schema.people.phone, '+5218111111111'),
    });
    const otherAgent = await t.db.insert(schema.agents).values({ name: 'Otra Reclutadora' }).returning();
    await t.db
      .update(schema.leads)
      .set({ assignedAgentId: otherAgent[0]!.id })
      .where(eq(schema.leads.personId, person!.id));

    const res = await post<{ leadsAssigned: number }>(
      `${t.baseUrl}/api/import/whatsapp-history`,
      batch('Hernan', [
        {
          externalMessageId: 'wa-hist:5218111111111:1000000200:cc',
          externalUserId: '5218111111111',
          phoneE164: '+5218111111111',
          body: 'Un mensaje más de la misma persona',
          sentAt: '2026-06-20T18:30:00.000Z',
        },
      ]),
    );
    expect(res.body.leadsAssigned).toBe(0);

    const lead = await t.db.query.leads.findFirst({ where: eq(schema.leads.personId, person!.id) });
    expect(lead?.assignedAgentId).toBe(otherAgent[0]!.id);
  });

  it('un lote con referral heurístico marca origin=paid sin campaña real', async () => {
    await post(
      `${t.baseUrl}/api/import/whatsapp-history`,
      batch('Gladys', [
        {
          externalMessageId: 'wa-hist:5218133333333:1000000300:dd',
          externalUserId: '5218133333333',
          phoneE164: '+5218133333333',
          body: 'Vi el anuncio de Facebook',
          sentAt: '2026-06-21T18:30:00.000Z',
          referral: { sourceId: 'historic-heuristic:facebook-text', sourceType: 'legacy_import_heuristic' },
        },
      ]),
    );

    const person = await t.db.query.people.findFirst({
      where: eq(schema.people.phone, '+5218133333333'),
    });
    const lead = await t.db.query.leads.findFirst({ where: eq(schema.leads.personId, person!.id) });
    expect(lead?.origin).toBe('paid');
    expect(lead?.campaignId).toBeNull();
  });
});
