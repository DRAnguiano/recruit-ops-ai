/**
 * Cliente de la API de campos personalizados (add-custom-fields): diccionario
 * de definiciones por entidad (lead/persona) y sus valores con evidencia.
 */

import { FieldDefinition, FieldValue } from '../types';
import { api } from './client';

export type FieldEntity = 'leads' | 'people';

const DEFINITIONS_ENDPOINT: Record<FieldEntity, string> = {
  leads: '/api/lead-field-definitions',
  people: '/api/person-field-definitions',
};

export function listFieldDefinitions(entity: FieldEntity): Promise<FieldDefinition[]> {
  return api<FieldDefinition[]>(DEFINITIONS_ENDPOINT[entity]);
}

export interface FieldDefinitionCreate {
  key: string;
  label: string;
  type: FieldDefinition['type'];
  options?: string[];
  required?: boolean;
  sortOrder?: number;
}

export function createFieldDefinition(
  entity: FieldEntity,
  body: FieldDefinitionCreate,
): Promise<FieldDefinition> {
  return api<FieldDefinition>(DEFINITIONS_ENDPOINT[entity], {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type FieldDefinitionUpdate = Partial<
  Omit<FieldDefinitionCreate, 'key'> & { active: boolean }
>;

export function updateFieldDefinition(
  entity: FieldEntity,
  id: string,
  patch: FieldDefinitionUpdate,
): Promise<FieldDefinition> {
  return api<FieldDefinition>(`${DEFINITIONS_ENDPOINT[entity]}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteFieldDefinition(entity: FieldEntity, id: string): Promise<void> {
  return api<void>(`${DEFINITIONS_ENDPOINT[entity]}/${id}`, { method: 'DELETE' });
}

export function listFieldValues(entity: FieldEntity, entityId: string): Promise<FieldValue[]> {
  return api<FieldValue[]>(`/api/${entity}/${entityId}/custom-fields`);
}

/** El backend siempre fija `source='human'` en este endpoint público. */
export function setFieldValue(
  entity: FieldEntity,
  entityId: string,
  key: string,
  value: string | number | boolean,
): Promise<FieldValue> {
  return api<FieldValue>(`/api/${entity}/${entityId}/custom-fields/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}
