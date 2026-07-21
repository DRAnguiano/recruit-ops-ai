import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp, waitFor } from './helpers';

const META_APP_SECRET = 'multi-account-secret';

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

function whatsappWebhook(phoneNumberId: string, from: string, messageId: string, body: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: 'Contacto' }, wa_id: from }],
              messages: [
                {
                  from,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

interface FakeCloudApi {
  server: Server;
  baseUrl: string;
  /** phone_number_id -> cuerpos recibidos en /{id}/messages. */
  callsByAccount: Map<string, Array<Record<string, unknown>>>;
}

/** Fake WhatsApp Cloud API: distingue la cuenta por el phone_number_id del path. */
function startFakeCloudApi(): Promise<FakeCloudApi> {
  const callsByAccount = new Map<string, Array<Record<string, unknown>>>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const match = req.url?.match(/^\/([^/]+)\/messages/);
      if (!match) {
        res.writeHead(404);
        res.end();
        return;
      }
      const accountId = match[1]!;
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>;
      const calls = callsByAccount.get(accountId) ?? [];
      calls.push(body);
      callsByAccount.set(accountId, calls);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ messages: [{ id: `wamid.out_${accountId}_${calls.length}` }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, callsByAccount });
    });
  });
}

interface CredMeta {
  id: string;
  kind: string;
  accountExternalId: string | null;
  active: boolean;
}

/**
 * E2e de multi-account-routing (add-multi-account-routing): dos números de
 * WhatsApp activos, cada entrante crea/continúa su propia conversación con
 * el `channel_account` correcto y la respuesta sale por la credencial de esa
 * cuenta. Cubre también el fallback ambiguo (varias activas, sin cuenta).
 */
describe('Multi-account routing: dos cuentas de WhatsApp', () => {
  let t: TestApp;
  let fake: FakeCloudApi;

  beforeAll(async () => {
    fake = await startFakeCloudApi();
    t = await bootTestApp({ META_APP_SECRET, META_VERIFY_TOKEN: 'x', GRAPH_API_BASE_URL: fake.baseUrl });

    await fetch(`${t.baseUrl}/api/channel-credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'whatsapp',
        label: 'Número A',
        secrets: { access_token: 'token-a', phone_number_id: 'NUM_A' },
      }),
    });
    await fetch(`${t.baseUrl}/api/channel-credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'whatsapp',
        label: 'Número B',
        secrets: { access_token: 'token-b', phone_number_id: 'NUM_B' },
      }),
    });
  });

  afterAll(async () => {
    await t.cleanup();
    fake.server.close();
  });

  it('entrante a cada número crea su conversación con el channel_account correcto', async () => {
    for (const [account, from] of [
      ['NUM_A', '5218711111111'],
      ['NUM_B', '5218722222222'],
    ] as const) {
      const body = whatsappWebhook(account, from, `wamid.${account}`, `hola desde ${account}`);
      const res = await fetch(`${t.baseUrl}/webhooks/meta`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
        body,
      });
      expect(res.status).toBe(200);
    }

    const conversations = await waitFor(async () => {
      const rows = await t.db.query.conversations.findMany({ where: eq(schema.conversations.channel, 'whatsapp') });
      return rows.length === 2 ? rows : null;
    });
    const byAccount = new Map(conversations.map((c) => [c.channelAccount, c]));
    expect(byAccount.has('NUM_A')).toBe(true);
    expect(byAccount.has('NUM_B')).toBe(true);
  });

  it('la respuesta a cada conversación sale por la credencial de su propia cuenta', async () => {
    const conversations = await t.db.query.conversations.findMany({
      where: eq(schema.conversations.channel, 'whatsapp'),
    });
    for (const conversation of conversations) {
      const res = await fetch(`${t.baseUrl}/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: `respuesta para ${conversation.channelAccount}` }),
      });
      expect(res.status).toBe(201);
    }

    await waitFor(async () => {
      const messages = await t.db.query.messages.findMany({
        where: eq(schema.messages.direction, 'outbound'),
      });
      return messages.every((m) => m.delivery?.status === 'sent') && messages.length === 2 ? messages : null;
    });

    expect(fake.callsByAccount.get('NUM_A')).toHaveLength(1);
    expect(fake.callsByAccount.get('NUM_B')).toHaveLength(1);
    expect(fake.callsByAccount.get('NUM_A')?.[0]).toMatchObject({ to: '5218711111111' });
    expect(fake.callsByAccount.get('NUM_B')?.[0]).toMatchObject({ to: '5218722222222' });
  });

  it('conversación sin channel_account (previa al ruteo) con varias cuentas activas → CHANNEL_NOT_CONFIGURED', async () => {
    const [person] = await t.db.insert(schema.people).values({ phone: '+5218733333333' }).returning({
      id: schema.people.id,
    });
    await t.db.insert(schema.channelIdentities).values({
      personId: person!.id,
      channel: 'whatsapp',
      externalId: '5218733333333',
    });
    const [conversation] = await t.db
      .insert(schema.conversations)
      .values({ personId: person!.id, channel: 'whatsapp', channelAccount: null })
      .returning();

    const res = await fetch(`${t.baseUrl}/api/conversations/${conversation!.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'ambiguo' }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('CHANNEL_NOT_CONFIGURED');
  });

  it('con una sola cuenta activa, la conversación sin channel_account hace fallback y envía', async () => {
    const creds = (await (await fetch(`${t.baseUrl}/api/channel-credentials`)).json()) as CredMeta[];
    const numB = creds.find((c) => c.kind === 'whatsapp' && c.accountExternalId === 'NUM_B')!;
    await fetch(`${t.baseUrl}/api/channel-credentials/${numB.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    try {
      const [person] = await t.db.insert(schema.people).values({ phone: '+5218744444444' }).returning({
        id: schema.people.id,
      });
      await t.db.insert(schema.channelIdentities).values({
        personId: person!.id,
        channel: 'whatsapp',
        externalId: '5218744444444',
      });
      const [conversation] = await t.db
        .insert(schema.conversations)
        .values({ personId: person!.id, channel: 'whatsapp', channelAccount: null, lastMessageAt: new Date() })
        .returning();
      // Ventana de 24h abierta: un entrante reciente (whatsapp-window-policy).
      await t.db.insert(schema.messages).values({
        conversationId: conversation!.id,
        channel: 'whatsapp',
        externalMessageId: 'wamid.fallback-inbound',
        direction: 'inbound',
        type: 'text',
        body: 'hola',
        sentAt: new Date(),
      });

      const res = await fetch(`${t.baseUrl}/api/conversations/${conversation!.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'fallback a la única activa' }),
      });
      expect(res.status).toBe(201);
    } finally {
      await fetch(`${t.baseUrl}/api/channel-credentials/${numB.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
    }
  });
});
