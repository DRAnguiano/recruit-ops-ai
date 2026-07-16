import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { resetEnvCache } from '../src/config/env';
import * as schema from '../src/database/schema';
import { telegramMessageUpdate, whatsappStatusPayload, whatsappTextPayload } from './adapters.spec';
import { createEphemeralDatabase, EphemeralDatabase, REDIS_URL, waitFor } from './helpers';

const META_APP_SECRET = 'test-app-secret';
const META_VERIFY_TOKEN = 'test-verify-token';
const TELEGRAM_SECRET = 'test-telegram-secret';

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

describe('webhooks (channel-webhooks)', () => {
  let ephemeral: EphemeralDatabase;
  let app: INestApplication;
  let baseUrl: string;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    ephemeral = await createEphemeralDatabase();
    process.env.DATABASE_URL = ephemeral.url;
    process.env.REDIS_URL = REDIS_URL;
    process.env.NODE_ENV = 'test';
    process.env.META_APP_SECRET = META_APP_SECRET;
    process.env.META_VERIFY_TOKEN = META_VERIFY_TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = TELEGRAM_SECRET;
    // Aísla las colas BullMQ de esta suite (Redis es compartido entre suites).
    process.env.QUEUE_SUFFIX = `-wh${Date.now().toString(36)}`;
    resetEnvCache();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.listen(0);
    const url = await app.getUrl();
    baseUrl = url.replace('[::1]', 'localhost');

    client = postgres(ephemeral.url);
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
    await app.close();
    await ephemeral.drop();
  });

  it('GET /webhooks/meta responde el hub.challenge con verify token correcto', async () => {
    const res = await fetch(
      `${baseUrl}/webhooks/meta?hub.mode=subscribe&hub.verify_token=${META_VERIFY_TOKEN}&hub.challenge=12345`,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('12345');
  });

  it('GET /webhooks/meta con verify token incorrecto responde 403', async () => {
    const res = await fetch(
      `${baseUrl}/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`,
    );
    expect(res.status).toBe(403);
  });

  it('POST /webhooks/meta sin firma o con firma inválida responde 403 y no persiste', async () => {
    const body = JSON.stringify(whatsappTextPayload);
    const noSig = await fetch(`${baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(noSig.status).toBe(403);

    const badSig = await fetch(`${baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      body,
    });
    expect(badSig.status).toBe(403);

    expect(await db.select().from(schema.messages)).toHaveLength(0);
  });

  it('POST /webhooks/meta con firma válida ingiere el mensaje; el reintento no duplica', async () => {
    const body = JSON.stringify(whatsappTextPayload);
    const headers = {
      'content-type': 'application/json',
      'x-hub-signature-256': metaSignature(body),
    };

    const first = await fetch(`${baseUrl}/webhooks/meta`, { method: 'POST', headers, body });
    expect(first.status).toBe(200);
    const second = await fetch(`${baseUrl}/webhooks/meta`, { method: 'POST', headers, body });
    expect(second.status).toBe(200);

    // La ingestión ahora es asíncrona (cola): esperar a que el worker procese.
    await waitFor(async () => {
      const rows = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.channel, 'whatsapp'));
      return rows.length >= 1;
    });
    await new Promise((r) => setTimeout(r, 500)); // margen para un posible duplicado

    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.channel, 'whatsapp'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe('Hola, vi la vacante de tráiler');
    expect(rows[0]?.rawPayload).toBeTruthy();

    const receivedEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'message.received'));
    expect(receivedEvents).toHaveLength(1);

    const person = await db
      .select()
      .from(schema.people)
      .where(eq(schema.people.phone, '+5218711234567'));
    expect(person).toHaveLength(1);
  });

  it('POST /webhooks/meta con payload solo de statuses ACKea 200 sin crear filas', async () => {
    const body = JSON.stringify(whatsappStatusPayload);
    const res = await fetch(`${baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 500));
    const rows = await db.select().from(schema.messages);
    expect(rows).toHaveLength(1); // solo el del test anterior
  });

  it('POST /webhooks/meta de Messenger (object: page) ACKea 200 sin procesar', async () => {
    const body = JSON.stringify({ object: 'page', entry: [] });
    const res = await fetch(`${baseUrl}/webhooks/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('POST /webhooks/telegram exige el secret token', async () => {
    const body = JSON.stringify(telegramMessageUpdate);
    const noSecret = await fetch(`${baseUrl}/webhooks/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(noSecret.status).toBe(403);

    const ok = await fetch(`${baseUrl}/webhooks/telegram`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': TELEGRAM_SECRET,
      },
      body,
    });
    expect(ok.status).toBe(200);

    const rows = await waitFor(async () => {
      const found = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.channel, 'telegram'));
      return found.length === 1 ? found : null;
    });
    expect(rows[0]?.externalMessageId).toBe('777000111_42');
  });
});
