import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp } from './helpers';

const ORIGIN = 'http://localhost:5173';

interface PageBody<T = Record<string, unknown>> {
  items: T[];
  nextCursor: string | null;
}

describe('API de inbox (inbox-api, api-conventions)', () => {
  let t: TestApp;
  let mediaDir: string;
  let personId: string;
  let conversationId: string;
  let agentId: string;

  beforeAll(async () => {
    mediaDir = mkdtempSync(join(tmpdir(), 'crm-media-'));
    t = await bootTestApp({ MEDIA_STORAGE_DIR: mediaDir, CORS_ALLOWED_ORIGINS: ORIGIN });

    // Datos directos en DB: persona con 3 conversaciones y mensajes.
    const [person] = await t.db
      .insert(schema.people)
      .values({ phone: '+5218711234567', name: 'Juan Pérez' })
      .returning();
    personId = person!.id;

    const base = Date.parse('2026-07-10T12:00:00Z');
    for (let i = 0; i < 3; i++) {
      const [conv] = await t.db
        .insert(schema.conversations)
        .values({
          personId,
          channel: i === 2 ? 'telegram' : 'whatsapp',
          status: i === 0 ? 'closed' : 'open',
          lastMessageAt: new Date(base + i * 60_000),
        })
        .returning();
      if (i === 1) conversationId = conv!.id;
      for (let m = 0; m < 3; m++) {
        await t.db.insert(schema.messages).values({
          conversationId: conv!.id,
          channel: conv!.channel,
          externalMessageId: `ext-${i}-${m}`,
          direction: m % 2 === 0 ? 'inbound' : 'outbound',
          type: 'text',
          body: `mensaje ${i}-${m}`,
          sentAt: new Date(base + i * 60_000 + m * 1000),
        });
      }
    }

    const [agent] = await t.db
      .insert(schema.agents)
      .values({ name: 'Adriana' })
      .returning();
    agentId = agent!.id;
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('GET /api/conversations lista con persona, orden por actividad y filtros', async () => {
    const res = await fetch(`${t.baseUrl}/api/conversations`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageBody<{
      id: string;
      person: { phone: string; name: string };
      lastMessageAt: string;
    }>;
    expect(body.items).toHaveLength(3);
    expect(body.items[0]!.person.phone).toBe('+5218711234567');
    // Orden: actividad más reciente primero.
    const times = body.items.map((c) => Date.parse(c.lastMessageAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const open = await fetch(`${t.baseUrl}/api/conversations?status=open`);
    expect(((await open.json()) as PageBody).items).toHaveLength(2);

    const tg = await fetch(`${t.baseUrl}/api/conversations?channel=telegram`);
    expect(((await tg.json()) as PageBody).items).toHaveLength(1);

    // Filtro por persona (migrate-spa-to-api): todas las conversaciones son suyas.
    const byPerson = await fetch(`${t.baseUrl}/api/conversations?personId=${personId}`);
    expect(((await byPerson.json()) as PageBody).items).toHaveLength(3);
    const nobody = await fetch(
      `${t.baseUrl}/api/conversations?personId=00000000-0000-4000-8000-000000000000`,
    );
    expect(((await nobody.json()) as PageBody).items).toHaveLength(0);
  });

  it('pagina por cursor sin duplicados ni huecos', async () => {
    const first = await fetch(`${t.baseUrl}/api/conversations?limit=2`);
    const page1 = (await first.json()) as PageBody<{ id: string }>;
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const second = await fetch(
      `${t.baseUrl}/api/conversations?limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
    );
    const page2 = (await second.json()) as PageBody<{ id: string }>;
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const ids = [...page1.items, ...page2.items].map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('GET /api/conversations/:id/messages en orden cronológico con paginación', async () => {
    const res = await fetch(`${t.baseUrl}/api/conversations/${conversationId}/messages?limit=2`);
    const page1 = (await res.json()) as PageBody<{ body: string; sentAt: string }>;
    expect(page1.items.map((m) => m.body)).toEqual(['mensaje 1-0', 'mensaje 1-1']);

    const res2 = await fetch(
      `${t.baseUrl}/api/conversations/${conversationId}/messages?limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
    );
    const page2 = (await res2.json()) as PageBody<{ body: string }>;
    expect(page2.items.map((m) => m.body)).toEqual(['mensaje 1-2']);
    expect(page2.nextCursor).toBeNull();
  });

  it('404 tipado para conversación inexistente y 400 zod para query inválida', async () => {
    const missing = await fetch(
      `${t.baseUrl}/api/conversations/00000000-0000-4000-8000-000000000000`,
    );
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe('CONVERSATION_NOT_FOUND');

    const invalid = await fetch(`${t.baseUrl}/api/conversations?limit=-1`);
    expect(invalid.status).toBe(400);
    const body = (await invalid.json()) as { code: string; issues: unknown[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('asigna agente, filtra por asignación y emite evento actor=user', async () => {
    const res = await fetch(`${t.baseUrl}/api/conversations/${conversationId}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { assignedAgentId: string }).assignedAgentId).toBe(agentId);

    const filtered = await fetch(`${t.baseUrl}/api/conversations?assignedAgentId=${agentId}`);
    expect(((await filtered.json()) as PageBody).items).toHaveLength(1);

    const events = await t.db.query.domainEvents.findMany();
    const assigned = events.find((e) => e.type === 'conversation.assigned');
    expect(assigned?.actor).toBe('user');

    const badAgent = await fetch(`${t.baseUrl}/api/conversations/${conversationId}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(badAgent.status).toBe(404);
    expect(((await badAgent.json()) as { code: string }).code).toBe('AGENT_NOT_FOUND');
  });

  it('toggle de attention mode con validación estricta', async () => {
    const res = await fetch(`${t.baseUrl}/api/conversations/${conversationId}/attention-mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'bot' }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { attentionMode: string }).attentionMode).toBe('bot');

    const events = await t.db.query.domainEvents.findMany();
    expect(events.some((e) => e.type === 'conversation.attention_mode_changed' && e.actor === 'user')).toBe(true);

    const invalid = await fetch(`${t.baseUrl}/api/conversations/${conversationId}/attention-mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'robot' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('cierre manual; cerrar dos veces es 409 tipado', async () => {
    const res = await fetch(`${t.baseUrl}/api/conversations/${conversationId}/close`, {
      method: 'POST',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; closedAt: string };
    expect(body.status).toBe('closed');
    expect(body.closedAt).toBeTruthy();

    const again = await fetch(`${t.baseUrl}/api/conversations/${conversationId}/close`, {
      method: 'POST',
    });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { code: string }).code).toBe('CONVERSATION_ALREADY_CLOSED');
  });

  it('media stored se descarga con su mime; pending es 404 tipado', async () => {
    const conv = await t.db.query.conversations.findFirst();
    const storageKey = 'whatsapp/test/voz.ogg';
    mkdirSync(join(mediaDir, 'whatsapp/test'), { recursive: true });
    writeFileSync(join(mediaDir, storageKey), Buffer.from('OGGDATA'));

    const [stored] = await t.db
      .insert(schema.messages)
      .values({
        conversationId: conv!.id,
        channel: 'whatsapp',
        externalMessageId: 'ext-media-1',
        direction: 'inbound',
        type: 'audio',
        media: { externalId: 'm1', mimeType: 'audio/ogg', status: 'stored', storageKey },
        sentAt: new Date(),
      })
      .returning();

    const res = await fetch(`${t.baseUrl}/api/messages/${stored!.id}/media`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('audio/ogg');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('OGGDATA');

    const [pending] = await t.db
      .insert(schema.messages)
      .values({
        conversationId: conv!.id,
        channel: 'whatsapp',
        externalMessageId: 'ext-media-2',
        direction: 'inbound',
        type: 'audio',
        media: { externalId: 'm2', status: 'pending' },
        sentAt: new Date(),
      })
      .returning();

    const notReady = await fetch(`${t.baseUrl}/api/messages/${pending!.id}/media`);
    expect(notReady.status).toBe(404);
    expect(((await notReady.json()) as { code: string }).code).toBe('MEDIA_NOT_AVAILABLE');
  });

  it('CORS: origen permitido recibe el header, origen ajeno no', async () => {
    const allowed = await fetch(`${t.baseUrl}/api/conversations`, {
      headers: { origin: ORIGIN },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);

    const denied = await fetch(`${t.baseUrl}/api/conversations`, {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('/health sigue fuera del prefijo /api', async () => {
    const res = await fetch(`${t.baseUrl}/health`);
    expect(res.status).toBe(200);
  });
});
