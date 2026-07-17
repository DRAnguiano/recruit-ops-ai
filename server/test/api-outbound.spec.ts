import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { resetEnvCache } from '../src/config/env';
import { bootTestApp, TestApp, waitFor } from './helpers';

const META_APP_SECRET = 'outbound-secret';
const PHONE_NUMBER_ID = '555000111';

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

/**
 * Fake de Cloud API + Bot API de Telegram: captura los envíos y responde ids.
 * `to === '5218000000000'` siempre falla con 500 (para probar reintentos).
 */
function startFakeChannelApis(): Promise<{
  server: Server;
  baseUrl: string;
  captured: CapturedRequest[];
}> {
  const captured: CapturedRequest[] = [];
  let wamidSeq = 0;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      captured.push({ url: req.url ?? '', body });

      if ((req.url ?? '').includes('/sendMessage')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: 9001 } }));
        return;
      }
      if (body.to === '5218000000000') {
        res.writeHead(500);
        res.end('boom');
        return;
      }
      wamidSeq += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ messages: [{ id: `wamid.OUT-${wamidSeq}` }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, captured });
    });
  });
}

function statusWebhookPayload(
  statuses: Array<{ id: string; status: string; errors?: unknown[] }>,
): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses } }] }],
  });
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

interface SentMessage {
  id: string;
  body: string;
  delivery: { status: string; error?: string } | null;
}

describe('envío saliente y delivery (outbound-messaging, whatsapp-window-policy, delivery-status)', () => {
  let t: TestApp;
  let fake: Awaited<ReturnType<typeof startFakeChannelApis>>;
  let waConversationId: string; // whatsapp, ventana abierta
  let waExpiredId: string; // whatsapp, ventana expirada
  let tgConversationId: string; // telegram
  let templateId: string;
  const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let ws: WebSocket;

  beforeAll(async () => {
    fake = await startFakeChannelApis();
    t = await bootTestApp({
      META_APP_SECRET,
      META_VERIFY_TOKEN: 'x',
      WHATSAPP_ACCESS_TOKEN: 'wa-token',
      WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
      GRAPH_API_BASE_URL: fake.baseUrl,
      TELEGRAM_BOT_TOKEN: 'tg-token',
      // El seed exige el juego completo por kind: sin webhook_secret no se crea
      // la credencial telegram y el sender queda "no configurado".
      TELEGRAM_WEBHOOK_SECRET: 'tg-wh',
      TELEGRAM_API_BASE_URL: fake.baseUrl,
      OUTBOUND_JOB_ATTEMPTS: '2',
      OUTBOUND_JOB_BACKOFF_MS: '100',
    });

    const now = new Date();
    const seed = async (
      phone: string,
      channel: string,
      externalId: string,
      lastInboundAt: Date | null,
    ): Promise<string> => {
      const [person] = await t.db.insert(schema.people).values({ phone }).returning();
      await t.db
        .insert(schema.channelIdentities)
        .values({ personId: person!.id, channel, externalId });
      const [conv] = await t.db
        .insert(schema.conversations)
        .values({ personId: person!.id, channel, lastMessageAt: lastInboundAt ?? now })
        .returning();
      if (lastInboundAt) {
        await t.db.insert(schema.messages).values({
          conversationId: conv!.id,
          channel,
          externalMessageId: `in-${externalId}`,
          direction: 'inbound',
          type: 'text',
          body: 'hola, me interesa',
          sentAt: lastInboundAt,
        });
      }
      return conv!.id;
    };

    waConversationId = await seed('+5218711110001', 'whatsapp', '5218711110001', now);
    waExpiredId = await seed(
      '+5218711110002',
      'whatsapp',
      '5218711110002',
      new Date(now.getTime() - 25 * 60 * 60 * 1000),
    );
    tgConversationId = await seed('+5218711110003', 'telegram', '777001', now);

    const [template] = await t.db
      .insert(schema.messageTemplates)
      .values({
        name: 'vacante_seguimiento',
        language: 'es_MX',
        channel: 'whatsapp',
        body: 'Hola {{1}}, ¿sigues interesado en la vacante de {{2}}?',
        variablesCount: 2,
      })
      .returning();
    templateId = template!.id;

    ws = new WebSocket(`${t.baseUrl.replace(/^http/, 'ws')}/ws`);
    ws.on('message', (d) => frames.push(JSON.parse(String(d)) as (typeof frames)[number]));
    await new Promise<void>((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });
  });

  afterAll(async () => {
    ws.close();
    await t.cleanup();
    fake.server.close();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.GRAPH_API_BASE_URL;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_API_BASE_URL;
    delete process.env.OUTBOUND_JOB_ATTEMPTS;
    delete process.env.OUTBOUND_JOB_BACKOFF_MS;
    resetEnvCache();
  });

  it('texto libre en ventana: persiste queued → worker envía → sent con wamid', async () => {
    const res = await postJson<SentMessage>(
      `${t.baseUrl}/api/conversations/${waConversationId}/messages`,
      { body: 'Buen día, ¿sigues disponible?' },
    );
    expect(res.status).toBe(201);
    expect(res.body.delivery?.status).toBe('queued');

    const message = await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({
        where: eq(schema.messages.id, res.body.id),
      });
      return row?.delivery?.status === 'sent' ? row : null;
    });
    expect(message.externalMessageId).toMatch(/^wamid\.OUT-/);

    // El fake recibió el payload de texto de la Cloud API con el phone number id.
    const sent = fake.captured.find((c) => c.url.includes(PHONE_NUMBER_ID));
    expect(sent?.body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5218711110001',
      type: 'text',
    });

    const events = await t.db.query.domainEvents.findMany();
    expect(events.some((e) => e.type === 'message.sent' && e.actor === 'user')).toBe(true);

    // El mensaje aparece en el listado del inbox con su delivery.
    const list = await fetch(
      `${t.baseUrl}/api/conversations/${waConversationId}/messages`,
    );
    const items = ((await list.json()) as { items: SentMessage[] }).items;
    const outbound = items.find((m) => m.id === res.body.id);
    expect(outbound?.delivery?.status).toBe('sent');
  });

  it('fuera de ventana: texto libre 409 WINDOW_EXPIRED, plantilla sí sale renderizada', async () => {
    const rejected = await postJson<{ code: string }>(
      `${t.baseUrl}/api/conversations/${waExpiredId}/messages`,
      { body: 'hola?' },
    );
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('WINDOW_EXPIRED');

    const wrongVars = await postJson<{ code: string }>(
      `${t.baseUrl}/api/conversations/${waExpiredId}/messages`,
      { templateId, variables: ['Juan'] },
    );
    expect(wrongVars.status).toBe(400);

    const sent = await postJson<SentMessage>(
      `${t.baseUrl}/api/conversations/${waExpiredId}/messages`,
      { templateId, variables: ['Juan', 'quinta rueda'] },
    );
    expect(sent.status).toBe(201);
    expect(sent.body.body).toBe('Hola Juan, ¿sigues interesado en la vacante de quinta rueda?');

    await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({
        where: eq(schema.messages.id, sent.body.id),
      });
      return row?.delivery?.status === 'sent' ? row : null;
    });
    const templateCall = fake.captured.find(
      (c) => (c.body as { type?: string }).type === 'template',
    );
    expect(templateCall?.body.template).toMatchObject({ name: 'vacante_seguimiento' });
  });

  it('detalle expone la ventana; Telegram siempre libre y envía por sendMessage', async () => {
    const waDetail = (await (
      await fetch(`${t.baseUrl}/api/conversations/${waConversationId}`)
    ).json()) as { canSendFreeform: boolean; windowExpiresAt: string | null };
    expect(waDetail.canSendFreeform).toBe(true);
    expect(waDetail.windowExpiresAt).toBeTruthy();

    const expiredDetail = (await (
      await fetch(`${t.baseUrl}/api/conversations/${waExpiredId}`)
    ).json()) as { canSendFreeform: boolean };
    expect(expiredDetail.canSendFreeform).toBe(false);

    const tgDetail = (await (
      await fetch(`${t.baseUrl}/api/conversations/${tgConversationId}`)
    ).json()) as { canSendFreeform: boolean; windowExpiresAt: string | null };
    expect(tgDetail.canSendFreeform).toBe(true);
    expect(tgDetail.windowExpiresAt).toBeNull();

    const res = await postJson<SentMessage>(
      `${t.baseUrl}/api/conversations/${tgConversationId}/messages`,
      { body: 'Hola desde el CRM' },
    );
    expect(res.status).toBe(201);
    const message = await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({
        where: eq(schema.messages.id, res.body.id),
      });
      return row?.delivery?.status === 'sent' ? row : null;
    });
    expect(message.externalMessageId).toBe('777001_9001');
    const tgCall = fake.captured.find((c) => c.url.includes('/sendMessage'));
    expect(tgCall?.body).toMatchObject({ chat_id: '777001', text: 'Hola desde el CRM' });
  });

  it('canal sin credenciales → 409 CHANNEL_NOT_CONFIGURED sin persistir', async () => {
    // Las credenciales viven en el almacén cifrado: desactivar la del canal
    // (vía la API, que invalida el cache) es lo que lo deja "no configurado".
    const creds = (await (
      await fetch(`${t.baseUrl}/api/channel-credentials`)
    ).json()) as { id: string; kind: string }[];
    const wa = creds.find((c) => c.kind === 'whatsapp')!;
    await fetch(`${t.baseUrl}/api/channel-credentials/${wa.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    try {
      const before = await t.db.query.messages.findMany({
        where: eq(schema.messages.direction, 'outbound'),
      });
      const res = await postJson<{ code: string }>(
        `${t.baseUrl}/api/conversations/${waConversationId}/messages`,
        { body: 'no debería salir' },
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CHANNEL_NOT_CONFIGURED');
      const after = await t.db.query.messages.findMany({
        where: eq(schema.messages.direction, 'outbound'),
      });
      expect(after.length).toBe(before.length);
    } finally {
      await fetch(`${t.baseUrl}/api/channel-credentials/${wa.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
    }
  });

  it('conversación cerrada → 409 CONVERSATION_CLOSED', async () => {
    await fetch(`${t.baseUrl}/api/conversations/${waExpiredId}/close`, { method: 'POST' });
    const res = await postJson<{ code: string }>(
      `${t.baseUrl}/api/conversations/${waExpiredId}/messages`,
      { templateId, variables: ['Juan', 'full'] },
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONVERSATION_CLOSED');
  });

  it('statuses webhook: sent→delivered→read en vivo, sin regresión, desconocido ignorado', async () => {
    const message = await t.db.query.messages.findFirst({
      where: and(
        eq(schema.messages.conversationId, waConversationId),
        eq(schema.messages.direction, 'outbound'),
      ),
    });
    const wamid = message!.externalMessageId;

    const post = async (status: string, errors?: unknown[]): Promise<number> => {
      const body = statusWebhookPayload([{ id: wamid, status, ...(errors ? { errors } : {}) }]);
      const res = await fetch(`${t.baseUrl}/webhooks/meta`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': metaSignature(body),
        },
        body,
      });
      return res.status;
    };

    expect(await post('delivered')).toBe(200);
    await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({
        where: eq(schema.messages.id, message!.id),
      });
      return row?.delivery?.status === 'delivered' ? row : null;
    });

    expect(await post('read')).toBe(200);
    await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({
        where: eq(schema.messages.id, message!.id),
      });
      return row?.delivery?.status === 'read' ? row : null;
    });

    // Frames WS de delivery en vivo.
    await waitFor(async () =>
      frames.filter(
        (f) => f.type === 'message.delivery_updated' && f.payload.aggregateId === message!.id,
      ).length >= 2
        ? true
        : null,
    );

    // Regresión ignorada: delivered después de read no cambia nada ni re-emite.
    const eventsBefore = (
      await t.db.query.domainEvents.findMany({
        where: eq(schema.domainEvents.type, 'message.delivery_updated'),
      })
    ).length;
    expect(await post('delivered')).toBe(200);
    await new Promise((r) => setTimeout(r, 600));
    const row = await t.db.query.messages.findFirst({
      where: eq(schema.messages.id, message!.id),
    });
    expect(row?.delivery?.status).toBe('read');
    const eventsAfter = (
      await t.db.query.domainEvents.findMany({
        where: eq(schema.domainEvents.type, 'message.delivery_updated'),
      })
    ).length;
    expect(eventsAfter).toBe(eventsBefore);

    // Status para wamid desconocido: ACK 200 y nada explota.
    const unknownBody = statusWebhookPayload([{ id: 'wamid.NUNCA-EXISTIO', status: 'read' }]);
    const unknownRes = await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': metaSignature(unknownBody),
      },
      body: unknownBody,
    });
    expect(unknownRes.status).toBe(200);
  });

  it('reintentos agotados → delivery failed con el error visible', async () => {
    // Persona cuyo wa_id hace fallar al fake con 500 siempre.
    const [person] = await t.db
      .insert(schema.people)
      .values({ phone: '+5218000000000' })
      .returning();
    await t.db.insert(schema.channelIdentities).values({
      personId: person!.id,
      channel: 'whatsapp',
      externalId: '5218000000000',
    });
    const [conv] = await t.db
      .insert(schema.conversations)
      .values({ personId: person!.id, channel: 'whatsapp' })
      .returning();
    await t.db.insert(schema.messages).values({
      conversationId: conv!.id,
      channel: 'whatsapp',
      externalMessageId: 'in-fail-1',
      direction: 'inbound',
      type: 'text',
      body: 'hola',
      sentAt: new Date(),
    });

    const res = await postJson<SentMessage>(
      `${t.baseUrl}/api/conversations/${conv!.id}/messages`,
      { body: 'esto va a fallar' },
    );
    expect(res.status).toBe(201);

    const failed = await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({
        where: eq(schema.messages.id, res.body.id),
      });
      return row?.delivery?.status === 'failed' ? row : null;
    });
    expect(failed.delivery?.error).toContain('HTTP 500');
  });
});
