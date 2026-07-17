import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp, waitFor } from './helpers';

const META_APP_SECRET = 'realtime-secret';
const AUDIO_BYTES = Buffer.from('OGG-REALTIME-AUDIO');

interface Frame {
  type: string;
  payload: Record<string, unknown>;
}

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

function audioWebhookPayload(wamid: string, mediaId: string, waId: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ profile: { name: 'RT Sender' }, wa_id: waId }],
              messages: [
                {
                  from: waId,
                  id: wamid,
                  timestamp: '1752602400',
                  type: 'audio',
                  audio: { id: mediaId, mime_type: 'audio/ogg' },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

function startFakeGraphApi(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/binary/')) {
      res.writeHead(200, { 'content-type': 'audio/ogg' });
      res.end(AUDIO_BYTES);
      return;
    }
    const port = (server.address() as AddressInfo).port;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ url: `http://127.0.0.1:${port}/binary/x`, mime_type: 'audio/ogg' }),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

/** Cliente WS de prueba que acumula los frames recibidos. */
async function connectClient(baseUrl: string): Promise<{ ws: WebSocket; frames: Frame[] }> {
  const ws = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/ws`);
  const frames: Frame[] = [];
  ws.on('message', (data) => {
    frames.push(JSON.parse(String(data)) as Frame);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, frames };
}

describe('tiempo real por WebSocket (realtime-updates)', () => {
  let t: TestApp;
  let graph: { server: Server; baseUrl: string };

  beforeAll(async () => {
    graph = await startFakeGraphApi();
    t = await bootTestApp({
      META_APP_SECRET,
      META_VERIFY_TOKEN: 'x',
      WHATSAPP_ACCESS_TOKEN: 'wa-token',
      // Juego completo para que el seed cree la credencial whatsapp (la
      // descarga de media resuelve el token desde ella).
      WHATSAPP_PHONE_NUMBER_ID: 'wa-phone',
      GRAPH_API_BASE_URL: graph.baseUrl,
      MEDIA_STORAGE_DIR: join(tmpdir(), `crm-rt-${Date.now().toString(36)}`),
    });
  });

  afterAll(async () => {
    await t.cleanup();
    graph.server.close();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.GRAPH_API_BASE_URL;
  });

  it('dos clientes reciben message.received y message.media_stored sin storageKey', async () => {
    const a = await connectClient(t.baseUrl);
    const b = await connectClient(t.baseUrl);

    const body = audioWebhookPayload('wamid.RT-1', 'RT-MEDIA-1', '5218717770001');
    const res = await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });
    expect(res.status).toBe(200);

    for (const client of [a, b]) {
      const received = await waitFor(async () =>
        client.frames.find((f) => f.type === 'message.received'),
      );
      expect(received.payload.conversationId).toBeTruthy();
      expect(received.payload.aggregateId).toBeTruthy();
      expect(received.payload.externalMessageId).toBe('wamid.RT-1');

      const stored = await waitFor(async () =>
        client.frames.find((f) => f.type === 'message.media_stored'),
      );
      expect(stored.payload.mimeType).toBe('audio/ogg');
      // Nunca se difunden claves internas de storage.
      expect(stored.payload).not.toHaveProperty('storageKey');
    }

    a.ws.close();
    b.ws.close();
  });

  it('un socket roto no afecta la ingestión ni a los demás clientes', async () => {
    const broken = await connectClient(t.baseUrl);
    const healthy = await connectClient(t.baseUrl);

    // Corte abrupto sin handshake de cierre: el server aún lo cree conectado.
    interface RawSocket {
      _socket: { destroy: () => void };
    }
    (broken.ws as unknown as RawSocket)._socket.destroy();

    const body = audioWebhookPayload('wamid.RT-2', 'RT-MEDIA-2', '5218717770002');
    const res = await fetch(`${t.baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });
    expect(res.status).toBe(200);

    // La ingestión persistió a pesar del socket roto.
    const message = await waitFor(async () =>
      t.db.query.messages.findFirst({
        where: eq(schema.messages.externalMessageId, 'wamid.RT-2'),
      }),
    );
    expect(message.direction).toBe('inbound');

    // El cliente sano sigue recibiendo frames.
    const received = await waitFor(async () =>
      healthy.frames.find(
        (f) => f.type === 'message.received' && f.payload.externalMessageId === 'wamid.RT-2',
      ),
    );
    expect(received.payload.conversationId).toBe(message.conversationId);

    healthy.ws.close();
  });
});
