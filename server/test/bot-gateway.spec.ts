import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { resetEnvCache } from '../src/config/env';
import { signBotBody } from '../src/bot/bot-signature';
import { bootTestApp, TestApp, waitFor } from './helpers';

const META_APP_SECRET = 'bot-gw-meta-secret';
const BOT_SECRET = 'bot-shared-secret-0123456789';
const PHONE_NUMBER_ID = '555000777';
const AUDIO_BYTES = Buffer.from('OGG-BOT-AUDIO');

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

function textWebhookPayload(wamid: string, waId: string, text: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      contacts: [{ profile: { name: 'Bot Candidate' }, wa_id: waId }],
      messages: [{ from: waId, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    } }] }],
  });
}

function audioWebhookPayload(wamid: string, waId: string, mediaId: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      contacts: [{ profile: { name: 'Bot Candidate' }, wa_id: waId }],
      messages: [{ from: waId, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'audio', audio: { id: mediaId, mime_type: 'audio/ogg' } }],
    } }] }],
  });
}

interface BotCall {
  signature: string | undefined;
  raw: string;
  payload: {
    contractVersion: number;
    conversation: { id: string; canSendFreeform: boolean };
    message: { id: string; type: string; body: string | null; mediaUrl?: string };
    lead: { classification: string } | null;
  };
}

/** Fake del FastAPI del bot + fake Graph API (media y envío) en un server. */
function startFakes(): Promise<{
  server: Server;
  baseUrl: string;
  botCalls: BotCall[];
  botFailing: { value: boolean };
}> {
  const botCalls: BotCall[] = [];
  const botFailing = { value: false };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const url = req.url ?? '';
      if (url.startsWith('/bot-webhook')) {
        if (botFailing.value) {
          res.writeHead(500);
          res.end('bot down');
          return;
        }
        botCalls.push({
          signature: req.headers['x-bot-signature'] as string | undefined,
          raw,
          payload: JSON.parse(raw) as BotCall['payload'],
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      if (url.startsWith('/binary/')) {
        res.writeHead(200, { 'content-type': 'audio/ogg' });
        res.end(AUDIO_BYTES);
        return;
      }
      if (req.method === 'POST' && url.includes(PHONE_NUMBER_ID)) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ messages: [{ id: `wamid.BOTOUT-${botCalls.length}-${Date.now()}` }] }));
        return;
      }
      // resolver de media id
      const port = (server.address() as AddressInfo).port;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ url: `http://127.0.0.1:${port}/binary/x`, mime_type: 'audio/ogg' }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, botCalls, botFailing });
    });
  });
}

async function postActions(
  baseUrl: string,
  actions: unknown[],
  secret: string = BOT_SECRET,
): Promise<{ status: number; body: { results?: Array<{ ok: boolean; error?: string }> } }> {
  const body = JSON.stringify({ contractVersion: 1, actions });
  const res = await fetch(`${baseUrl}/bot/v1/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bot-signature': signBotBody(body, secret) },
    body,
  });
  return { status: res.status, body: (await res.json()) as never };
}

describe('bot gateway (bot-gateway, bot-actions, attention-lock)', () => {
  let t: TestApp;
  let fakes: Awaited<ReturnType<typeof startFakes>>;
  let conversationId: string;
  const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let ws: WebSocket;

  beforeAll(async () => {
    fakes = await startFakes();
    t = await bootTestApp({
      META_APP_SECRET,
      META_VERIFY_TOKEN: 'x',
      WHATSAPP_ACCESS_TOKEN: 'wa-token',
      WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
      GRAPH_API_BASE_URL: fakes.baseUrl,
      BOT_WEBHOOK_URL: `${fakes.baseUrl}/bot-webhook`,
      BOT_SHARED_SECRET: BOT_SECRET,
      BOT_NOTIFY_ATTEMPTS: '2',
      BOT_NOTIFY_BACKOFF_MS: '100',
    });
    // La base pública real solo se conoce tras app.listen(0).
    process.env.PUBLIC_BASE_URL = t.baseUrl;
    resetEnvCache();

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
    fakes.server.close();
    for (const key of [
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'GRAPH_API_BASE_URL',
      'BOT_WEBHOOK_URL',
      'BOT_SHARED_SECRET',
      'BOT_NOTIFY_ATTEMPTS',
      'BOT_NOTIFY_BACKOFF_MS',
      'PUBLIC_BASE_URL',
    ]) {
      delete process.env[key];
    }
    resetEnvCache();
  });

  it('modo humano es silencio; en modo bot el texto llega firmado con la ventana', async () => {
    // Primer mensaje: la conversación nace en modo humano → sin notificación.
    const first = textWebhookPayload('wamid.BOT-1', '5218715551001', 'hola, vi el anuncio');
    await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(first) },
      body: first,
    });
    const conversation = await waitFor(async () => t.db.query.conversations.findFirst());
    conversationId = conversation.id;
    await new Promise((r) => setTimeout(r, 800));
    expect(fakes.botCalls).toHaveLength(0);

    // Encender el bot (toggle humano existente) y mandar otro mensaje.
    await fetch(`${t.baseUrl}/api/conversations/${conversationId}/attention-mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'bot' }),
    });
    const second = textWebhookPayload('wamid.BOT-2', '5218715551001', 'me interesa la vacante de quinta rueda');
    await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(second) },
      body: second,
    });

    const call = await waitFor(async () => fakes.botCalls[0]);
    // Firma HMAC verificable con el secreto compartido.
    expect(call.signature).toBe(signBotBody(call.raw, BOT_SECRET));
    expect(call.payload.contractVersion).toBe(1);
    expect(call.payload.conversation.id).toBe(conversationId);
    expect(call.payload.conversation.canSendFreeform).toBe(true);
    expect(call.payload.message.body).toContain('quinta rueda');
    expect(call.payload.lead?.classification).toBe('vacancy');
  });

  it('la media notifica cuando el binario está stored, con mediaUrl descargable', async () => {
    const audio = audioWebhookPayload('wamid.BOT-AUDIO-1', '5218715551001', 'BOT-MEDIA-1');
    await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(audio) },
      body: audio,
    });

    const call = await waitFor(async () =>
      fakes.botCalls.find((c) => c.payload.message.type === 'audio'),
    );
    expect(call.payload.message.mediaUrl).toBeTruthy();
    const media = await fetch(call.payload.message.mediaUrl!);
    expect(media.status).toBe(200);
    expect(Buffer.from(await media.arrayBuffer())).toEqual(AUDIO_BYTES);
  });

  it('bot caído no rompe la ingestión', async () => {
    fakes.botFailing.value = true;
    const body = textWebhookPayload('wamid.BOT-DOWN-1', '5218715551001', 'sigo aquí?');
    const res = await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });
    expect(res.status).toBe(200);

    const message = await waitFor(async () =>
      t.db.query.messages.findFirst({
        where: eq(schema.messages.externalMessageId, 'wamid.BOT-DOWN-1'),
      }),
    );
    expect(message.direction).toBe('inbound');
    fakes.botFailing.value = false;
  });

  it('send_message del bot pasa por el pipeline con actor=bot', async () => {
    const res = await postActions(t.baseUrl, [
      { type: 'send_message', conversationId, body: 'Hola, soy el asistente. ¿Tienes licencia federal?' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results![0]).toEqual({ action: 'send_message', ok: true });

    const outbound = await waitFor(async () => {
      const row = await t.db.query.messages.findFirst({
        where: and(
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.direction, 'outbound'),
        ),
      });
      return row?.delivery?.status === 'sent' ? row : null;
    });
    expect(outbound.body).toContain('licencia federal');

    const events = await t.db.query.domainEvents.findMany({
      where: eq(schema.domainEvents.type, 'message.sent'),
    });
    expect(events.some((e) => e.actor === 'bot')).toBe(true);
  });

  it('extract_data exige evidencia verificable y no muta el lead', async () => {
    const message = await t.db.query.messages.findFirst({
      where: eq(schema.messages.externalMessageId, 'wamid.BOT-2'),
    });

    // Cita inventada → rechazada, sin evento.
    const fake = await postActions(t.baseUrl, [
      { type: 'extract_data', conversationId, fields: [
        { key: 'experiencia', value: '10 años', evidence: { quote: 'tengo 10 años manejando', messageId: message!.id } },
      ] },
    ]);
    expect(fake.body.results![0]).toEqual({
      action: 'extract_data',
      ok: false,
      error: 'EVIDENCE_INVALID',
    });

    // Cita real → auditada como evento, lead intacto.
    const leadBefore = await t.db.query.leads.findFirst();
    const ok = await postActions(t.baseUrl, [
      { type: 'extract_data', conversationId, fields: [
        { key: 'vacante_interes', value: 'quinta_rueda', evidence: { quote: 'vacante de quinta rueda', messageId: message!.id } },
      ] },
    ]);
    expect(ok.body.results![0]!.ok).toBe(true);

    const events = await t.db.query.domainEvents.findMany({
      where: eq(schema.domainEvents.type, 'lead.data_extracted'),
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toBe('bot');
    const leadAfter = await t.db.query.leads.findFirst();
    expect(leadAfter).toEqual(leadBefore); // ni un campo mutado
  });

  it('handoff bot→humano y lock atómico: la toma humana gana', async () => {
    const handoff = await postActions(t.baseUrl, [
      { type: 'request_handoff', conversationId, reason: 'candidato pide humano' },
    ]);
    expect(handoff.body.results![0]!.ok).toBe(true);

    const conversation = await t.db.query.conversations.findFirst({
      where: eq(schema.conversations.id, conversationId),
    });
    expect(conversation?.attentionMode).toBe('human');

    // El frame llegó en vivo con actor bot.
    await waitFor(async () =>
      frames.find(
        (f) =>
          f.type === 'conversation.attention_mode_changed' &&
          f.payload.actor === 'bot' &&
          f.payload.reason === 'candidato pide humano',
      ),
    );

    // Con la conversación en humano, el bot ya no puede enviar (lock).
    const blocked = await postActions(t.baseUrl, [
      { type: 'send_message', conversationId, body: 'intento tardío' },
    ]);
    expect(blocked.body.results![0]).toEqual({
      action: 'send_message',
      ok: false,
      error: 'BOT_NOT_ACTIVE',
    });
    const lateMessages = await t.db.query.messages.findMany({
      where: and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.direction, 'outbound'),
      ),
    });
    expect(lateMessages).toHaveLength(1); // solo el envío anterior
  });

  it('firma inválida o acción fuera de catálogo se rechazan', async () => {
    const bad = await postActions(t.baseUrl, [
      { type: 'request_handoff', conversationId, reason: 'x' },
    ], 'wrong-secret-0123456789');
    expect(bad.status).toBe(403);

    const unknown = await postActions(t.baseUrl, [
      { type: 'advance_lead_status', conversationId, status: 'hired' },
    ]);
    expect(unknown.status).toBe(400);
  });
});
