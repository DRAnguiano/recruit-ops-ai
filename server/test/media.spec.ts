import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ChannelQueuesService } from '../src/channels/channel-queues.service';
import { resetEnvCache } from '../src/config/env';
import * as schema from '../src/database/schema';
import { createEphemeralDatabase, EphemeralDatabase, REDIS_URL, waitFor } from './helpers';

const META_APP_SECRET = 'media-secret';
const AUDIO_BYTES = Buffer.from('OGG-FAKE-AUDIO-CONTENT');

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

/** Graph API falsa: resuelve media ids y sirve binarios; los ids FAIL dan 500. */
function startFakeGraphApi(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/binary/')) {
      res.writeHead(200, { 'content-type': 'audio/ogg' });
      res.end(AUDIO_BYTES);
      return;
    }
    if (url.includes('FAIL')) {
      res.writeHead(500);
      res.end('boom');
      return;
    }
    const mediaId = url.slice(1);
    const port = (server.address() as AddressInfo).port;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ url: `http://127.0.0.1:${port}/binary/${mediaId}`, mime_type: 'audio/ogg' }),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function audioWebhookPayload(wamid: string, mediaId: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ profile: { name: 'Audio Sender' }, wa_id: '5218717770001' }],
              messages: [
                {
                  from: '5218717770001',
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

describe('media end-to-end (media-ingestion + media-download + queued-ingestion)', () => {
  let ephemeral: EphemeralDatabase;
  let app: INestApplication;
  let baseUrl: string;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let graph: { server: Server; baseUrl: string };
  let storageDir: string;

  beforeAll(async () => {
    ephemeral = await createEphemeralDatabase();
    graph = await startFakeGraphApi();
    storageDir = join(tmpdir(), `crm-media-test-${Date.now().toString(36)}`);

    process.env.DATABASE_URL = ephemeral.url;
    process.env.REDIS_URL = REDIS_URL;
    process.env.NODE_ENV = 'test';
    process.env.META_APP_SECRET = META_APP_SECRET;
    process.env.META_VERIFY_TOKEN = 'x';
    process.env.WHATSAPP_ACCESS_TOKEN = 'wa-token';
    process.env.GRAPH_API_BASE_URL = graph.baseUrl;
    process.env.MEDIA_STORAGE_DIR = storageDir;
    process.env.QUEUE_SUFFIX = `-md${Date.now().toString(36)}`;
    process.env.MEDIA_JOB_ATTEMPTS = '2';
    process.env.MEDIA_JOB_BACKOFF_MS = '100';
    resetEnvCache();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');

    client = postgres(ephemeral.url);
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
    await app.close();
    graph.server.close();
    await ephemeral.drop();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.GRAPH_API_BASE_URL;
    delete process.env.MEDIA_JOB_ATTEMPTS;
    delete process.env.MEDIA_JOB_BACKOFF_MS;
    resetEnvCache();
  });

  it('webhook con audio → cola → descarga → binario en storage + status stored + evento', async () => {
    const body = audioWebhookPayload('wamid.MEDIA-OK-1', 'MEDIA-OK-1');
    const res = await fetch(`${baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });
    expect(res.status).toBe(200);

    const message = await waitFor(async () => {
      const row = await db.query.messages.findFirst({
        where: eq(schema.messages.externalMessageId, 'wamid.MEDIA-OK-1'),
      });
      return row?.media?.status === 'stored' ? row : null;
    });

    expect(message.type).toBe('audio');
    expect(message.media).toMatchObject({
      status: 'stored',
      mimeType: 'audio/ogg',
      sizeBytes: AUDIO_BYTES.byteLength,
    });

    const storedPath = join(storageDir, message.media!.storageKey!);
    expect(existsSync(storedPath)).toBe(true);
    expect(readFileSync(storedPath)).toEqual(AUDIO_BYTES);

    const events = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'message.media_stored'));
    expect(events).toHaveLength(1);

    // El pipeline de leads también corrió para el mensaje de audio.
    const lead = await db.query.leads.findFirst();
    expect(lead).toBeTruthy();
  });

  it('descarga que agota reintentos → media.status=failed con el error', async () => {
    const body = audioWebhookPayload('wamid.MEDIA-FAIL-1', 'MEDIA-FAIL-1');
    await fetch(`${baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });

    const message = await waitFor(async () => {
      const row = await db.query.messages.findFirst({
        where: eq(schema.messages.externalMessageId, 'wamid.MEDIA-FAIL-1'),
      });
      return row?.media?.status === 'failed' ? row : null;
    });
    expect(message.media?.error).toContain('HTTP 500 al resolver media');
  });

  it('sin token del canal la media queda pending (sin crash)', async () => {
    const [person] = await db.insert(schema.people).values({ phone: '+5218717779999' }).returning();
    const [conversation] = await db
      .insert(schema.conversations)
      .values({ personId: person!.id, channel: 'telegram' })
      .returning();
    const [message] = await db
      .insert(schema.messages)
      .values({
        conversationId: conversation!.id,
        channel: 'telegram',
        externalMessageId: 'tg_notoken_1',
        direction: 'inbound',
        type: 'audio',
        media: { externalId: 'TG-FILE-1', status: 'pending' },
        sentAt: new Date(),
      })
      .returning();

    // TELEGRAM_BOT_TOKEN no está configurado en esta suite.
    const queues = app.get(ChannelQueuesService);
    await queues.enqueueMedia(message!.id);
    await new Promise((r) => setTimeout(r, 800));

    const after = await db.query.messages.findFirst({
      where: eq(schema.messages.id, message!.id),
    });
    expect(after?.media?.status).toBe('pending');
  });
});
