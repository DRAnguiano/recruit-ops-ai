import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp, TEST_CREDENTIALS_KEY } from './helpers';

interface CredMeta {
  id: string;
  kind: string;
  label: string;
  active: boolean;
  configured: boolean;
}

async function req<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

describe('API de credenciales de canal (channel-credentials)', () => {
  let t: TestApp;
  const base = () => `${t.baseUrl}/api/channel-credentials`;

  beforeAll(async () => {
    // Sin env legacy de canal: el seed no crea nada, empezamos en limpio.
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('create cifra los secretos y nunca los devuelve', async () => {
    const res = await req<CredMeta>('POST', base(), {
      kind: 'whatsapp',
      label: 'Línea principal',
      secrets: { access_token: 'wa-secreto-visible', phone_number_id: '555000111' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'whatsapp', label: 'Línea principal', active: true, configured: true });
    expect(JSON.stringify(res.body)).not.toContain('wa-secreto-visible');

    // En la DB el secreto va cifrado, jamás en texto plano.
    const row = await t.db.query.channelCredentials.findFirst({
      where: eq(schema.channelCredentials.id, res.body.id),
    });
    expect(row?.secretsEncrypted).toBeTruthy();
    expect(row!.secretsEncrypted).not.toContain('wa-secreto-visible');
  });

  it('list oculta secretos (solo metadatos + configured)', async () => {
    const res = await req<CredMeta[]>('GET', base());
    expect(res.status).toBe(200);
    const wa = res.body.find((c) => c.kind === 'whatsapp');
    expect(wa).toMatchObject({ configured: true });
    expect(Object.keys(wa!)).not.toContain('secrets');
    expect(JSON.stringify(res.body)).not.toContain('555000111');
  });

  it('segunda credencial activa del mismo kind → 409 DUPLICATE_RESOURCE', async () => {
    const res = await req<{ code: string }>('POST', base(), {
      kind: 'whatsapp',
      label: 'Otra línea',
      secrets: { access_token: 't2', phone_number_id: '999' },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_RESOURCE');
  });

  it('update rota los secretos (cambia el ciphertext)', async () => {
    const list = await req<CredMeta[]>('GET', base());
    const wa = list.body.find((c) => c.kind === 'whatsapp')!;
    const before = await t.db.query.channelCredentials.findFirst({
      where: eq(schema.channelCredentials.id, wa.id),
    });
    const res = await req<CredMeta>('PATCH', `${base()}/${wa.id}`, {
      secrets: { access_token: 'wa-rotado', phone_number_id: '555000111' },
    });
    expect(res.status).toBe(200);
    const after = await t.db.query.channelCredentials.findFirst({
      where: eq(schema.channelCredentials.id, wa.id),
    });
    expect(after!.secretsEncrypted).not.toEqual(before!.secretsEncrypted);
  });

  it('update con campos que no corresponden al kind → 400 VALIDATION_ERROR', async () => {
    const list = await req<CredMeta[]>('GET', base());
    const wa = list.body.find((c) => c.kind === 'whatsapp')!;
    const res = await req<{ code: string }>('PATCH', `${base()}/${wa.id}`, {
      secrets: { bot_token: 'no-va-aquí', webhook_secret: 'x' },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('delete quita la credencial del listado', async () => {
    const list = await req<CredMeta[]>('GET', base());
    const wa = list.body.find((c) => c.kind === 'whatsapp')!;
    const del = await req('DELETE', `${base()}/${wa.id}`);
    expect(del.status).toBe(200);
    const after = await req<CredMeta[]>('GET', base());
    expect(after.body.find((c) => c.kind === 'whatsapp')).toBeUndefined();
  });

  it('create sin todos los campos del kind → 400', async () => {
    const res = await req<{ code: string }>('POST', base(), {
      kind: 'meta_app',
      label: 'incompleta',
      secrets: { app_secret: 'solo-uno' },
    });
    expect(res.status).toBe(400);
  });
});

describe('Seed de credenciales desde env legacy (channel-credentials)', () => {
  let t: TestApp;

  beforeAll(async () => {
    // Con las env legacy presentes + llave: el seed migra al almacén.
    t = await bootTestApp({
      CHANNEL_CREDENTIALS_KEY: TEST_CREDENTIALS_KEY,
      META_APP_SECRET: 'seed-app-secret',
      META_VERIFY_TOKEN: 'seed-verify',
      TELEGRAM_BOT_TOKEN: 'seed-bot',
      TELEGRAM_WEBHOOK_SECRET: 'seed-wh',
      // WhatsApp incompleto a propósito: solo token, sin phone_number_id.
      WHATSAPP_ACCESS_TOKEN: 'seed-wa',
    });
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('migra los kinds con env completa y omite los incompletos', async () => {
    const res = await req<CredMeta[]>('GET', `${t.baseUrl}/api/channel-credentials`);
    const kinds = res.body.map((c) => c.kind).sort();
    expect(kinds).toEqual(['meta_app', 'telegram']);
    // WhatsApp estaba incompleto (faltaba phone_number_id) → no se migró.
    expect(res.body.find((c) => c.kind === 'whatsapp')).toBeUndefined();
  });

  it('no duplica: una sola credencial activa por kind (índice único parcial)', async () => {
    const dup = await req<{ code: string }>('POST', `${t.baseUrl}/api/channel-credentials`, {
      kind: 'meta_app',
      label: 'segunda app',
      secrets: { app_secret: 'x', verify_token: 'y' },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_RESOURCE');
  });
});
