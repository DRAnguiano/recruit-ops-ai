import { eq } from 'drizzle-orm';
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

const snapshot = {
  snapshotDate: '2026-07-17',
  circuits: [
    { circuit: 'MTY', units: 25, unitsInMaintenance: 1, unitsActive: 24, hcAuthorized: 30, hcReal: 22 },
    { circuit: 'CLARIOS SENCILLO', units: 30, unitsInMaintenance: 1, unitsActive: 29, hcAuthorized: 35, hcReal: 31 },
    { circuit: 'BOCAR', units: 19, unitsInMaintenance: 2, unitsActive: 17, hcAuthorized: 22, hcReal: 22 },
  ],
};

describe('capacidad operativa por circuito (operational-capacity)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('importa el snapshot: upsert por circuito con déficit recalculado', async () => {
    const res = await post<{ created: number; updated: number }>(
      `${t.baseUrl}/api/import/hc-capacity`,
      snapshot,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 3, updated: 0 });

    const mty = await t.db.query.circuitCapacity.findFirst({
      where: eq(schema.circuitCapacity.circuit, 'MTY'),
    });
    expect(mty).toMatchObject({ hcAuthorized: 30, hcReal: 22, deficit: 8 });
    expect(mty?.snapshotDate).toBe('2026-07-17');

    const bocar = await t.db.query.circuitCapacity.findFirst({
      where: eq(schema.circuitCapacity.circuit, 'BOCAR'),
    });
    expect(bocar?.deficit).toBe(0);
  });

  it('reimportar es idempotente (upsert en sitio, sin filas nuevas)', async () => {
    const before = await t.db.select().from(schema.circuitCapacity);
    const res = await post<{ created: number; updated: number }>(
      `${t.baseUrl}/api/import/hc-capacity`,
      snapshot,
    );
    expect(res.body).toMatchObject({ created: 0, updated: 3 });
    const after = await t.db.select().from(schema.circuitCapacity);
    expect(after.length).toBe(before.length);
  });

  it('GET /api/circuit-capacity ordena por déficit descendente', async () => {
    const res = await fetch(`${t.baseUrl}/api/circuit-capacity`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ circuit: string; deficit: number }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.circuit).toBe('MTY'); // déficit 8, el mayor
    const deficits = rows.map((r) => r.deficit);
    expect(deficits).toEqual([...deficits].sort((a, b) => b - a));
  });

  it('un snapshot posterior actualiza el HC real y el déficit del circuito', async () => {
    await post(`${t.baseUrl}/api/import/hc-capacity`, {
      snapshotDate: '2026-07-24',
      circuits: [{ circuit: 'MTY', hcAuthorized: 30, hcReal: 28 }],
    });
    const mty = await t.db.query.circuitCapacity.findFirst({
      where: eq(schema.circuitCapacity.circuit, 'MTY'),
    });
    expect(mty).toMatchObject({ hcReal: 28, deficit: 2, snapshotDate: '2026-07-24' });
  });
});
