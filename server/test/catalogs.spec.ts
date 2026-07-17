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

async function patch<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe('catálogos de valores de dominio (configurable-catalogs)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t.cleanup();
  });

  it('la migración siembra estados de lead y tipos de vacante', async () => {
    const statuses = (await (await fetch(`${t.baseUrl}/api/lead-statuses`)).json()) as Array<{
      name: string;
      label: string;
    }>;
    expect(statuses.map((s) => s.name)).toEqual([
      'new',
      'in_progress',
      'documents',
      'hired',
      'discarded',
      'no_response',
    ]);

    const types = (await (await fetch(`${t.baseUrl}/api/vacancy-types`)).json()) as Array<{
      name: string;
    }>;
    expect(types.map((v) => v.name)).toEqual(['sencillo', 'full', 'quinta_rueda', 'escuelita']);
  });

  it('CRUD de circuito: crear, listar ordenado, name inmutable', async () => {
    const b = await post<{ id: string }>(`${t.baseUrl}/api/circuits`, {
      name: 'tramo_torreon',
      label: 'Tramo Torreón',
      sortOrder: 2,
    });
    expect(b.status).toBe(201);
    const a = await post<{ id: string }>(`${t.baseUrl}/api/circuits`, {
      name: 'clarios',
      label: 'Clarios',
      sortOrder: 1,
    });
    expect(a.status).toBe(201);

    const list = (await (await fetch(`${t.baseUrl}/api/circuits`)).json()) as Array<{
      name: string;
    }>;
    expect(list.map((c) => c.name)).toEqual(['clarios', 'tramo_torreon']);

    // name inmutable: strict() responde 400 en vez de ignorarlo.
    const renamed = await patch<{ code: string }>(`${t.baseUrl}/api/circuits/${a.body.id}`, {
      name: 'otro',
    });
    expect(renamed.status).toBe(400);

    const relabel = await patch<{ label: string }>(`${t.baseUrl}/api/circuits/${a.body.id}`, {
      label: 'Clarios MX',
    });
    expect(relabel.status).toBe(200);
    expect(relabel.body.label).toBe('Clarios MX');
  });

  it('valores fuera de catálogo en vacantes → 400 con permitidos', async () => {
    await post(`${t.baseUrl}/api/companies`, { name: 'Transmontes', label: 'Transmontes' });

    const bad = await post<{ code: string; details?: { issues: unknown[] } }>(
      `${t.baseUrl}/api/vacancies`,
      {
        type: 'inventado',
        modality: 'local',
        company: 'Transmontes',
      },
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');

    const ok = await post<{ id: string }>(`${t.baseUrl}/api/vacancies`, {
      type: 'full',
      circuit: 'clarios',
      modality: 'local',
      company: 'Transmontes',
      quota: 3,
    });
    expect(ok.status).toBe(201);
  });

  it('entrada nueva de catálogo es usable de inmediato (invalidación de cache)', async () => {
    await post(`${t.baseUrl}/api/vacancy-types`, { name: 'torton', label: 'Tortón' });
    const ok = await post<{ id: string }>(`${t.baseUrl}/api/vacancies`, {
      type: 'torton',
      modality: 'local',
      company: 'Transmontes',
    });
    expect(ok.status).toBe(201);
  });

  it('DELETE de entrada referenciada por texto → 409 RESOURCE_REFERENCED', async () => {
    const types = (await (await fetch(`${t.baseUrl}/api/vacancy-types`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    const full = types.find((v) => v.name === 'full')!;
    const res = await fetch(`${t.baseUrl}/api/vacancy-types/${full.id}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('RESOURCE_REFERENCED');

    const escuelita = types.find((v) => v.name === 'escuelita')!;
    const free = await fetch(`${t.baseUrl}/api/vacancy-types/${escuelita.id}`, {
      method: 'DELETE',
    });
    expect(free.status).toBe(200);
  });

  it('metas por periodo: weekly con circuito, duplicado 409, default monthly', async () => {
    const weekly = await post<{ id: string; periodKind: string }>(`${t.baseUrl}/api/goals`, {
      periodKind: 'weekly',
      company: 'Transmontes',
      vacancyType: 'full',
      circuit: 'clarios',
      target: 4,
    });
    expect(weekly.status).toBe(201);
    expect(weekly.body.periodKind).toBe('weekly');

    const duplicate = await post<{ code: string }>(`${t.baseUrl}/api/goals`, {
      periodKind: 'weekly',
      company: 'Transmontes',
      vacancyType: 'full',
      circuit: 'clarios',
      target: 9,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('DUPLICATE_RESOURCE');

    const monthly = await post<{ periodKind: string }>(`${t.baseUrl}/api/goals`, {
      company: 'Transmontes',
      vacancyType: 'full',
      target: 12,
    });
    expect(monthly.status).toBe(201);
    expect(monthly.body.periodKind).toBe('monthly');

    const badCompany = await post<{ code: string }>(`${t.baseUrl}/api/goals`, {
      company: 'Fantasma SA',
      vacancyType: 'full',
      target: 1,
    });
    expect(badCompany.status).toBe(400);
  });

  it('operador contratado con tipo y circuito de catálogo; moneda editable en campaña', async () => {
    const operator = await post<{ id: string; operatorType: string }>(
      `${t.baseUrl}/api/operators`,
      {
        empNo: 'EMP-100',
        company: 'Transmontes',
        name: 'Juan Chofer',
        operatorType: 'full',
        circuit: 'clarios',
      },
    );
    expect(operator.status).toBe(201);
    expect(operator.body.operatorType).toBe('full');

    const badType = await post<{ code: string }>(`${t.baseUrl}/api/operators`, {
      empNo: 'EMP-101',
      company: 'Transmontes',
      name: 'Otro',
      operatorType: 'trailero_x',
    });
    expect(badType.status).toBe(400);

    const campaign = await post<{ id: string }>(`${t.baseUrl}/api/campaigns`, {
      name: 'CSV Julio',
      source: 'csv',
    });
    const currency = await patch<{ currency: string }>(
      `${t.baseUrl}/api/campaigns/${campaign.body.id}`,
      { currency: 'MXN' },
    );
    expect(currency.status).toBe(200);
    expect(currency.body.currency).toBe('MXN');
  });

  it('status de lead: catálogo nuevo aceptado, fuera de catálogo 400, seed intacto', async () => {
    const [person] = await t.db
      .insert(schema.people)
      .values({ phone: '+5218719990001', name: 'Lead Catálogo' })
      .returning();
    const [lead] = await t.db
      .insert(schema.leads)
      .values({ personId: person!.id, status: 'new', classification: 'vacancy' })
      .returning();

    const invalid = await patch<{ code: string }>(`${t.baseUrl}/api/leads/${lead!.id}`, {
      status: 'estado_inventado',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    await post(`${t.baseUrl}/api/lead-statuses`, {
      name: 'interview',
      label: 'Entrevista',
      sortOrder: 2,
    });
    const ok = await patch<{ status: string }>(`${t.baseUrl}/api/leads/${lead!.id}`, {
      status: 'interview',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('interview');

    // El seed `new` sigue presente y no se puede borrar mientras haya leads new.
    const row = await t.db.query.leadStatuses.findFirst({
      where: eq(schema.leadStatuses.name, 'new'),
    });
    expect(row).toBeTruthy();
  });
});
