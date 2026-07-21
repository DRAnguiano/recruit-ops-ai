# Tasks — add-custom-fields

## 1. Schema y migración

- [x] 1.1 `schema.ts`: `lead_field_definitions` (`key` único, `label`, `type`, `options`
      jsonb, `required`, `active`, `sortOrder`, timestamps) y `lead_field_values`
      (`definitionId` FK, `leadId` FK a `leads.id` ON DELETE CASCADE, `value` jsonb,
      `source`, `evidenceText`, `evidenceMessageId`, timestamps) con único
      `(definition_id, lead_id)`
- [x] 1.2 `schema.ts`: `person_field_definitions` y `person_field_values` (misma forma,
      `personId` FK a `people.id` ON DELETE CASCADE) con único `(definition_id, person_id)`
- [x] 1.3 Migración drizzle `00NN_custom-fields.sql` + entrada en `meta/_journal.json`;
      aplicar a la DB de desarrollo y verificar

## 2. Servicio de definiciones (diccionario, por entidad)

- [x] 2.1 `custom-fields.schemas.ts`: zod de create/update de definición (validación de
      `type`, `options` no vacío obligatorio sólo para `select`, `key` inmutable en update)
      compartido entre ambas entidades
- [x] 2.2 `field-definitions.service.ts`: servicio genérico parametrizado por tabla
      (definiciones + valores) para no duplicar lógica entre lead/person; `create` →
      `DUPLICATE_RESOURCE` (23505); `remove` con chequeo explícito de valores
      referenciados → `RESOURCE_REFERENCED` (409); auditoría `<entidad>_field.definition_*`
      en `domain_events`
- [x] 2.3 `lead-field-definitions.controller.ts` y `person-field-definitions.controller.ts`:
      `GET` (orden `sortOrder`), `POST`, `PATCH`, `DELETE` en `/api/lead-field-definitions`
      y `/api/person-field-definitions`

## 3. Servicio de valores (con evidencia)

- [x] 3.1 `field-values.service.ts`: caché 60 s de definiciones activas de cada entidad
      (patrón `catalog-value.service`); `validateValue(def, value)` por tipo (`number`/
      `boolean`/`date`/`select`/`text`) → `VALIDATION_ERROR` con permitidos en `select`
- [x] 3.2 `setValue(entityId, key, value, source)`: upsert por `(definition_id, entity_id)`
      con precedencia de fuente (un `ai` no pisa un `human`; un `human` gana y fija
      `source='human'`); valida existencia de la entidad (lead/persona) → 404; audita
      `<entidad>_field.value_set`
- [x] 3.3 `listValues(entityId)`: definiciones activas + su valor (o null) con `source` y
      evidencia; 404 si la entidad no existe
- [x] 3.4 Controllers de valores: `GET /api/leads/:id/custom-fields`,
      `PUT /api/leads/:id/custom-fields/:key` y sus equivalentes `people` — el `PUT`
      público llama a `setValue(..., source: 'human')` fijo en el código, ignorando
      cualquier `source` del body

## 4. Cableado, tests y cierre

- [x] 4.1 `custom-fields.module.ts` (servicios + controllers de ambas entidades)
      registrado en `AppModule`
- [x] 4.2 Tests: CRUD de definiciones por entidad (`select` sin options → 400, `key`
      inmutable → 400, duplicado → 409, borrado referenciado → 409, `ON DELETE CASCADE` al
      borrar el lead/persona); valores (validación por tipo, `select` fuera de options →
      400, evidencia persistida, endpoint público siempre `source='human'`, `ai` no pisa
      `human` a nivel de servicio, `human` gana, lectura con huecos, entidad inexistente →
      404)
- [x] 4.3 `server/README.md` (recurso custom fields, ambas entidades) + `project.md` §10
      (marcar 11, añadir 11b `add-custom-fields-ui`) + suite completa + lint + verificación
      manual (alta de definición → set/get de valor por API con evidencia, para lead y
      persona)
