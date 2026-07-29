import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { bootTestApp, TestApp } from './helpers';

async function post<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe('importación de pautas de Meta (meta-pautas-import)', () => {
  let t: TestApp;
  const base = () => `${t.baseUrl}/api/import/meta-pautas`;

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('crea campañas ligadas a su agente y semana ISO; siembra el agente faltante', async () => {
    const res = await post<{ created: number; updated: number }>(base(), {
      campaigns: [
        {
          agent: 'Gladis',
          name: 'TO Glad | Senc. Esp. | Sem 14,15| $1000 MXN',
          startDate: '2026-06-01',
          endDate: '2026-07-14',
          spend: 170.5,
          leadsReported: 212,
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 1, updated: 0 });

    const agent = await t.db.query.agents.findFirst({ where: eq(schema.agents.name, 'Gladis') });
    expect(agent).toBeTruthy();

    const campaign = await t.db.query.campaigns.findFirst({
      where: eq(schema.campaigns.name, 'TO Glad | Senc. Esp. | Sem 14,15| $1000 MXN'),
    });
    expect(campaign).toMatchObject({
      targetAgentId: agent!.id,
      currency: 'USD',
      leadsReported: 212,
      source: 'csv',
    });
    expect(Number(campaign!.spend)).toBe(170.5);
    expect(campaign!.isoWeek).toMatch(/^2026-W\d{2}$/);
  });

  it('reimportar la misma pauta es idempotente (update, no duplica)', async () => {
    const before = await t.db.select().from(schema.campaigns);
    const res = await post<{ created: number; updated: number }>(base(), {
      campaigns: [
        {
          agent: 'Gladis',
          name: 'TO Glad | Senc. Esp. | Sem 14,15| $1000 MXN',
          startDate: '2026-06-01',
          endDate: '2026-07-14',
          spend: 170.5,
          leadsReported: 212,
        },
      ],
    });
    expect(res.body).toMatchObject({ created: 0, updated: 1 });
    const after = await t.db.select().from(schema.campaigns);
    expect(after.length).toBe(before.length);
  });

  it('reutiliza un agente existente en vez de duplicarlo', async () => {
    await post(base(), {
      campaigns: [
        { agent: 'Gladis', name: 'Otra campaña de Gladis', startDate: '2026-06-08', spend: 50, leadsReported: 30 },
      ],
    });
    const gladisAgents = await t.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.name, 'Gladis'));
    expect(gladisAgents).toHaveLength(1);
  });

  it('varias pautas de distintos agentes en un lote', async () => {
    const res = await post<{ created: number; updated: number }>(base(), {
      campaigns: [
        { agent: 'Hernan', name: 'TO HERNAN| Sem.13,14| $500MXN', startDate: '2026-06-01', spend: 50, leadsReported: 79 },
        { agent: 'Adriana', name: 'TO Adri | Full | Sem.15', startDate: '2026-06-01', spend: 56.89, leadsReported: 137 },
      ],
    });
    expect(res.body.created).toBe(2);

    const hernan = await t.db.query.agents.findFirst({ where: eq(schema.agents.name, 'Hernan') });
    const adriana = await t.db.query.agents.findFirst({ where: eq(schema.agents.name, 'Adriana') });
    expect(hernan).toBeTruthy();
    expect(adriana).toBeTruthy();

    const hernanCamp = await t.db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.name, 'TO HERNAN| Sem.13,14| $500MXN')),
    });
    expect(hernanCamp?.targetAgentId).toBe(hernan!.id);
  });
});
