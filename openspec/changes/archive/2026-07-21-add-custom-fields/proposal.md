## Why

El lead y la persona sólo tienen columnas fijas (status, notas, teléfono…): no hay forma de
capturar datos del candidato específicos del negocio (licencia, años de experiencia, tipo
de unidad que maneja, disponibilidad) sin migrar el schema. La reclutadora necesita definir
esos campos desde la operación, y son la **base del futuro score auditable** (project.md
§2.4, §3.15): cada dato debe poder llevar su evidencia (cita textual + fuente) para que un
criterio de score lo referencie sin inventar nada.

## What Changes

- **Diccionario de campos como datos, uno por entidad**: nuevas tablas
  `lead_field_definitions` y `person_field_definitions` — cada definición tiene `key`
  (inmutable, referenciada por sus valores y a futuro por el score), `label`, `type`
  (`text` | `number` | `boolean` | `select` | `date`), `options` (para `select`),
  `required`, `active`, `sortOrder`. Mismo patrón de catálogo-como-dato que
  `configurable-catalogs` (10): se desactiva, no se renombra; validación cacheada. Dos
  parejas de tablas en vez de una compartida por `entity`, para que la FK hacia
  `leads`/`people` sea real (integridad referencial de Postgres, no chequeo a mano).
- **Valores con evidencia**: `lead_field_values` y `person_field_values` — un valor por
  `(definición, lead|persona)`, con el `value` tipado (validado contra la definición), y
  campos de auditoría precursores del score: `source` (`human` | `ai`), `evidenceText`
  (cita textual) y `evidenceMessageId` (mensaje del que se extrajo). El endpoint público
  siempre escribe `source='human'` fijo en el código (igual que `actor` en outbound); no se
  expone ningún camino que pueda escribir `source='ai'` en este change — no hay hoy un
  llamador de confianza para eso (ni LLM propio conectado, ni sistema de roles/admin que
  gobierne el handoff bot→humano). El servicio sí implementa la regla de precedencia
  (una escritura `ai` nunca pisa una `human`) para que ese futuro trabajo sólo añada el
  endpoint interno, sin tocar el modelo.
- **API REST**: `GET/POST/PATCH/DELETE /api/lead-field-definitions` y
  `/api/person-field-definitions` (CRUD del diccionario por entidad, validación por tipo,
  `key` inmutable, borrado referenciado → 409); y `GET /api/leads/:id/custom-fields` +
  `PUT /api/leads/:id/custom-fields/:key` con sus equivalentes `/api/people/:id/...`
  (leer/escribir valores, validados contra su definición).
- **Sin cambios en el pipeline de leads ni en la SPA en este change**: la captura desde UI
  es un change propio (11b, ver Impact), igual que catálogos se partió en 10/10b.

## Capabilities

### New Capabilities

- `custom-fields`: diccionario de campos personalizados de lead y de persona (dos parejas
  de tablas con FK real, definibles por API: tipo, opciones, requerido, inmutable por
  `key`) y captura de sus valores validados por tipo, cada valor con su evidencia
  (fuente + cita) como base del score auditable.

### Modified Capabilities

<!-- Ninguna: leads-api y demás contratos no cambian de comportamiento; los valores viven
     en endpoints nuevos, no en el payload existente del lead. -->

## Impact

- **Schema**: cuatro tablas nuevas (`lead_field_definitions`, `lead_field_values`,
  `person_field_definitions`, `person_field_values`) con FK real a `leads`/`people`
  (`ON DELETE CASCADE`) + únicos (`key` por diccionario; `(definition_id, lead_id)` /
  `(definition_id, person_id)` por valores); migración drizzle. Sin tocar `leads` ni
  `people`.
- **Código**: módulo nuevo `custom-fields` (definiciones CRUD + servicio de valores con
  validación por tipo y caché de definiciones, patrón de `catalog-value.service`, servicio
  duplicado por entidad con la misma forma); registro en `AppModule`. Sin imports cruzados
  nuevos hacia `leads`.
- **Dependencias**: ninguna nueva.
- **Eventos**: mutaciones de definición y de valor auditan en `domain_events`
  (`lead_field.*`, `person_field.*`), fuente de auditoría para el score.
- **Split acordado (atomicidad ~12-15 tareas)**: la **UI de captura** en la SPA será el
  change **11b `add-custom-fields-ui`** (formulario dinámico por entidad, edición del
  diccionario), fuera de alcance aquí — igual que 10 → 10b.
- **Fuera de alcance, roadmap propio**: sistema de roles/administrador y conexión LLM
  multi-proveedor que gobernarán cuándo se escribe `source='ai'` y las reglas de handoff
  bot→humano — no existen hoy (no hay auth ni tabla de usuarios) y no están en la secuencia
  de `project.md` §10; se propondrán como change(s) propios más adelante.
- **Docs**: `server/README.md` (recurso de custom fields) y `project.md` §10 (marcar 11 y
  añadir 11b) al archivar.
