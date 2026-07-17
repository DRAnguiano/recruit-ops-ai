import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp, waitFor } from './helpers';

const META_APP_SECRET = 'meta-channels-secret';
const BOT_SECRET = 'meta-channels-bot-secret-0123';
const AD_ID = '120299999999999999';

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

interface FakeMeta {
  server: Server;
  baseUrl: string;
  sendApiCalls: Array<Record<string, unknown>>;
  botNotifications: Array<Record<string, unknown>>;
}

/** Send API de página + webhook del bot, en un solo server local. */
function startFakeMeta(): Promise<FakeMeta> {
  const fake: Partial<FakeMeta> = { sendApiCalls: [], botNotifications: [] };
  const server = createServer((req, res) => {
    let chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<
        string,
        unknown
      >;
      if (req.url?.startsWith('/PAGE1/messages')) {
        fake.sendApiCalls!.push(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ recipient_id: 'x', message_id: `m_out_${fake.sendApiCalls!.length}` }),
        );
        return;
      }
      if (req.url === '/bot') {
        fake.botNotifications!.push(body);
        res.writeHead(200);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ ...fake, server, baseUrl: `http://127.0.0.1:${port}` } as FakeMeta);
    });
  });
}

function messengerWebhook(
  mid: string,
  text: string,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    object: 'page',
    entry: [
      {
        id: '101',
        messaging: [
          {
            sender: { id: 'PSID-E2E-1' },
            timestamp: Date.now(),
            message: { mid, text },
            ...extra,
          },
        ],
      },
    ],
  });
}

describe('Messenger end-to-end (meta-messaging-channels)', () => {
  let t: TestApp;
  let fake: FakeMeta;

  beforeAll(async () => {
    fake = await startFakeMeta();
    t = await bootTestApp({
      META_APP_SECRET,
      META_VERIFY_TOKEN: 'x',
      GRAPH_API_BASE_URL: fake.baseUrl,
      META_PAGE_ID: 'PAGE1',
      META_PAGE_ACCESS_TOKEN: 'page-token',
      BOT_WEBHOOK_URL: `${fake.baseUrl}/bot`,
      BOT_SHARED_SECRET: BOT_SECRET,
    });
    await t.db
      .insert(schema.campaigns)
      .values({ externalId: AD_ID, name: 'CTM Traileros Julio', source: 'meta_api' });
  });

  afterAll(async () => {
    await t.cleanup();
    fake.server.close();
    delete process.env.META_PAGE_ID;
    delete process.env.META_PAGE_ACCESS_TOKEN;
    delete process.env.BOT_WEBHOOK_URL;
    delete process.env.BOT_SHARED_SECRET;
    resetEnvCache();
  });

  async function postWebhook(body: string): Promise<number> {
    const res = await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });
    return res.status;
  }

  it('mensaje con referral de anuncio → persona sin teléfono + lead atribuido paid', async () => {
    const status = await postWebhook(
      messengerWebhook('m_E2E-1', 'Vengo del anuncio de traileros', {
        referral: { ad_id: AD_ID, source: 'ADS', type: 'OPEN_THREAD' },
      }),
    );
    expect(status).toBe(200);

    const lead = await waitFor(async () => {
      const row = await t.db.query.leads.findFirst();
      return row?.campaignId ? row : null;
    });
    expect(lead.origin).toBe('paid');

    const person = await t.db.query.people.findFirst({
      where: eq(schema.people.id, lead.personId),
    });
    expect(person?.phone).toBeNull();
    expect(person?.name).toBeNull();

    const campaign = await t.db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, lead.campaignId!),
    });
    expect(campaign?.externalId).toBe(AD_ID);

    const conversation = await t.db.query.conversations.findFirst();
    expect(conversation?.channel).toBe('messenger');
  });

  it('respuesta de la reclutadora dentro de ventana → Send API con el PSID y delivery sent', async () => {
    const conversation = (await t.db.query.conversations.findFirst())!;
    const res = await fetch(`${t.baseUrl}/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: '¿Cuántos años de experiencia tienes?' }),
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const message = await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({ where: eq(schema.messages.id, id) });
      return row?.delivery?.status === 'sent' ? row : null;
    });
    expect(message.externalMessageId).toMatch(/^m_out_/);
    expect(fake.sendApiCalls.at(-1)).toMatchObject({
      recipient: { id: 'PSID-E2E-1' },
      messaging_type: 'RESPONSE',
      message: { text: '¿Cuántos años de experiencia tienes?' },
    });
  });

  it('plantilla en canal messenger → 409 TEMPLATES_NOT_SUPPORTED', async () => {
    const conversation = (await t.db.query.conversations.findFirst())!;
    const [template] = await t.db
      .insert(schema.messageTemplates)
      .values({
        name: 'saludo',
        channel: 'whatsapp',
        language: 'es_MX',
        body: 'Hola {{1}}',
        variablesCount: 1,
        status: 'approved',
      })
      .returning();
    const res = await fetch(`${t.baseUrl}/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId: template!.id, variables: ['Juan'] }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('TEMPLATES_NOT_SUPPORTED');
  });

  it('fuera de la ventana de 24 h → 409 WINDOW_EXPIRED sin fallback', async () => {
    const conversation = (await t.db.query.conversations.findFirst())!;
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await t.db
      .update(schema.messages)
      .set({ sentAt: old })
      .where(eq(schema.messages.direction, 'inbound'));

    const detail = (await (
      await fetch(`${t.baseUrl}/api/conversations/${conversation.id}`)
    ).json()) as { canSendFreeform: boolean };
    expect(detail.canSendFreeform).toBe(false);

    const res = await fetch(`${t.baseUrl}/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'tarde' }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('WINDOW_EXPIRED');
  });

  it('en modo bot el gateway notifica igual para messenger', async () => {
    const conversation = (await t.db.query.conversations.findFirst())!;
    await fetch(`${t.baseUrl}/api/conversations/${conversation.id}/attention-mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'bot' }),
    });

    await postWebhook(messengerWebhook('m_E2E-BOT-1', 'sigo interesado'));

    const notification = await waitFor(async () =>
      fake.botNotifications.find(
        (n) => (n['message'] as { body?: string } | undefined)?.body === 'sigo interesado',
      ),
    );
    expect(notification).toMatchObject({
      contractVersion: 1,
      conversation: { id: conversation.id, channel: 'messenger', attentionMode: 'bot' },
    });
  });

  it('sin env de página → 409 CHANNEL_NOT_CONFIGURED', async () => {
    delete process.env.META_PAGE_ACCESS_TOKEN;
    resetEnvCache();
    try {
      const conversation = (await t.db.query.conversations.findFirst())!;
      // Reabrir ventana para que el rechazo sea por credenciales, no por ventana.
      await t.db
        .update(schema.messages)
        .set({ sentAt: new Date() })
        .where(eq(schema.messages.direction, 'inbound'));
      const res = await fetch(`${t.baseUrl}/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'sin credenciales' }),
      });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe('CHANNEL_NOT_CONFIGURED');
    } finally {
      process.env.META_PAGE_ACCESS_TOKEN = 'page-token';
      resetEnvCache();
    }
  });
});
