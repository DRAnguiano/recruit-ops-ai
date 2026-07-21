import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { FieldValuesService } from '../src/custom-fields/field-values.service';
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

async function put<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe('diccionario y valores de campos personalizados (custom-fields)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t.cleanup();
  });

  async function createLead(phone: string): Promise<string> {
    const [person] = await t.db.insert(schema.people).values({ phone, name: 'Candidato' }).returning();
    const [lead] = await t.db.insert(schema.leads).values({ personId: person!.id }).returning();
    return lead!.id;
  }

  async function createPerson(phone: string): Promise<string> {
    const [person] = await t.db.insert(schema.people).values({ phone, name: 'Persona' }).returning();
    return person!.id;
  }

  it('CRUD de definición de lead: alta, key inmutable, select sin options → 400', async () => {
    const created = await post<{ id: string; key: string }>(
      `${t.baseUrl}/api/lead-field-definitions`,
      { key: 'licencia', label: 'Tipo de licencia', type: 'select', options: ['A', 'B', 'C'], required: true },
    );
    expect(created.status).toBe(201);
    expect(created.body.key).toBe('licencia');

    const noOptions = await post<{ code: string }>(`${t.baseUrl}/api/lead-field-definitions`, {
      key: 'sin_opciones',
      label: 'Sin opciones',
      type: 'select',
    });
    expect(noOptions.status).toBe(400);
    expect(noOptions.body.code).toBe('VALIDATION_ERROR');

    const renamed = await patch<{ code: string }>(
      `${t.baseUrl}/api/lead-field-definitions/${created.body.id}`,
      { key: 'otra_key' },
    );
    expect(renamed.status).toBe(400);
    expect(renamed.body.code).toBe('VALIDATION_ERROR');
  });

  it('duplicado de key en el mismo diccionario → 409 DUPLICATE_RESOURCE', async () => {
    const dup = await post<{ code: string }>(`${t.baseUrl}/api/lead-field-definitions`, {
      key: 'licencia',
      label: 'Otra',
      type: 'text',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_RESOURCE');
  });

  it('list ordenado por sortOrder', async () => {
    await post(`${t.baseUrl}/api/lead-field-definitions`, {
      key: 'experiencia',
      label: 'Años de experiencia',
      type: 'number',
      sortOrder: 1,
    });
    await post(`${t.baseUrl}/api/lead-field-definitions`, {
      key: 'disponible',
      label: 'Disponible de inmediato',
      type: 'boolean',
      sortOrder: 2,
    });
    const list = (await (await fetch(`${t.baseUrl}/api/lead-field-definitions`)).json()) as Array<{
      key: string;
    }>;
    // licencia se creó con sortOrder=0 (default) → primero.
    expect(list.map((d) => d.key)).toEqual(['licencia', 'experiencia', 'disponible']);
  });

  it('valor validado por tipo: number inválido → 400, select fuera de options → 400', async () => {
    const leadId = await createLead('+5218711110001');

    const badNumber = await put<{ code: string }>(
      `${t.baseUrl}/api/leads/${leadId}/custom-fields/experiencia`,
      { value: 'cinco' },
    );
    expect(badNumber.status).toBe(400);
    expect(badNumber.body.code).toBe('VALIDATION_ERROR');

    const badSelect = await put<{ code: string; allowed?: string[] }>(
      `${t.baseUrl}/api/leads/${leadId}/custom-fields/licencia`,
      { value: 'Z' },
    );
    expect(badSelect.status).toBe(400);
    expect(badSelect.body.code).toBe('VALIDATION_ERROR');
    expect(badSelect.body.allowed).toEqual(['A', 'B', 'C']);
  });

  it('el endpoint público siempre guarda source=human, ignorando el body', async () => {
    const leadId = await createLead('+5218711110002');
    const res = await put<{ source: string; value: unknown }>(
      `${t.baseUrl}/api/leads/${leadId}/custom-fields/licencia`,
      { value: 'A', source: 'ai', evidenceText: 'dijo que tiene licencia A' },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ value: 'A', source: 'human' });
  });

  it('lectura con huecos: definiciones activas con y sin valor', async () => {
    const leadId = await createLead('+5218711110003');
    await put(`${t.baseUrl}/api/leads/${leadId}/custom-fields/licencia`, { value: 'B' });

    const list = (await (
      await fetch(`${t.baseUrl}/api/leads/${leadId}/custom-fields`)
    ).json()) as Array<{ key: string; value: unknown; source: string | null }>;
    expect(list).toHaveLength(3);
    const licencia = list.find((f) => f.key === 'licencia')!;
    expect(licencia).toMatchObject({ value: 'B', source: 'human' });
    const experiencia = list.find((f) => f.key === 'experiencia')!;
    expect(experiencia).toMatchObject({ value: null, source: null });
  });

  it('entidad inexistente → 404', async () => {
    const res = await fetch(`${t.baseUrl}/api/leads/00000000-0000-0000-0000-000000000000/custom-fields`);
    expect(res.status).toBe(404);
  });

  it('precedencia a nivel de servicio: ai no pisa human; human sí pisa ai', async () => {
    const leadId = await createLead('+5218711110004');
    const values = t.app.get(FieldValuesService);

    const human = await values.setValue('lead', leadId, 'licencia', 'A', 'human');
    expect(human.source).toBe('human');

    // Un intento 'ai' sobre un valor 'human' no debe pisarlo.
    const aiAttempt = await values.setValue('lead', leadId, 'licencia', 'C', 'ai');
    expect(aiAttempt).toMatchObject({ value: 'A', source: 'human' });

    // Escribir 'ai' primero sobre un campo vacío sí se guarda...
    const aiFirst = await values.setValue('lead', leadId, 'experiencia', 5, 'ai');
    expect(aiFirst).toMatchObject({ value: 5, source: 'ai' });
    // ...y una corrección 'human' posterior siempre gana.
    const humanCorrection = await values.setValue('lead', leadId, 'experiencia', 7, 'human');
    expect(humanCorrection).toMatchObject({ value: 7, source: 'human' });
  });

  it('DELETE de definición referenciada → 409; sin valores → 200', async () => {
    const list = (await (
      await fetch(`${t.baseUrl}/api/lead-field-definitions`)
    ).json()) as Array<{ id: string; key: string }>;
    const licencia = list.find((d) => d.key === 'licencia')!;
    const referenced = await fetch(`${t.baseUrl}/api/lead-field-definitions/${licencia.id}`, {
      method: 'DELETE',
    });
    expect(referenced.status).toBe(409);
    expect(((await referenced.json()) as { code: string }).code).toBe('RESOURCE_REFERENCED');

    const unused = await post<{ id: string }>(`${t.baseUrl}/api/lead-field-definitions`, {
      key: 'sin_usar',
      label: 'Sin usar',
      type: 'text',
    });
    const removed = await fetch(`${t.baseUrl}/api/lead-field-definitions/${unused.body.id}`, {
      method: 'DELETE',
    });
    expect(removed.status).toBe(200);
  });

  it('ON DELETE CASCADE: borrar el lead borra sus valores', async () => {
    const leadId = await createLead('+5218711110005');
    await put(`${t.baseUrl}/api/leads/${leadId}/custom-fields/licencia`, { value: 'A' });

    await t.db.delete(schema.leads).where(eq(schema.leads.id, leadId));

    const remaining = await t.db.query.leadFieldValues.findFirst({
      where: eq(schema.leadFieldValues.leadId, leadId),
    });
    expect(remaining).toBeUndefined();
  });

  it('diccionario de persona es independiente del de lead', async () => {
    const created = await post<{ id: string; key: string }>(
      `${t.baseUrl}/api/person-field-definitions`,
      { key: 'idioma', label: 'Idioma preferido', type: 'text' },
    );
    expect(created.status).toBe(201);

    // La misma key puede existir en el diccionario de lead sin chocar.
    const sameKeyOnLead = await post<{ id: string }>(`${t.baseUrl}/api/lead-field-definitions`, {
      key: 'idioma',
      label: 'Idioma del lead',
      type: 'text',
    });
    expect(sameKeyOnLead.status).toBe(201);

    const personId = await createPerson('+5218711110006');
    const setOnPerson = await put<{ value: string }>(
      `${t.baseUrl}/api/people/${personId}/custom-fields/idioma`,
      { value: 'español' },
    );
    expect(setOnPerson.status).toBe(200);

    // El diccionario de lead no ve el valor puesto en persona.
    const leadId = await createLead('+5218711110007');
    const leadFields = (await (
      await fetch(`${t.baseUrl}/api/leads/${leadId}/custom-fields`)
    ).json()) as Array<{ key: string; value: unknown }>;
    expect(leadFields.find((f) => f.key === 'idioma')?.value).toBeNull();
  });
});
