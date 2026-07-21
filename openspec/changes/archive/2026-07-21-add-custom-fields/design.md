## Context

Lead y persona tienen columnas fijas. El negocio necesita capturar datos del candidato que
varían por operación (licencia, experiencia, tipo de unidad, disponibilidad) sin migrar el
schema cada vez, y esos datos son el insumo del **score auditable** de Fase 3 (project.md
§2.4): un criterio de score referenciará un campo por su `key` y exigirá su **evidencia**
(cita textual + fuente). Ya existe el patrón de **catálogo-como-dato** de
`configurable-catalogs` (10): tabla de definiciones con `name` inmutable + `label` +
`active`, validación cacheada 60 s en `CatalogValueService`, CRUD con `DUPLICATE_RESOURCE`
(23505) y `RESOURCE_REFERENCED` (borrado referenciado). Este change reusa ese patrón para
un diccionario de campos + sus valores.

## Goals / Non-Goals

**Goals:**
- Diccionario de campos de lead y de persona definible por API (tipo, opciones, requerido,
  inmutable por `key`), con integridad referencial real hacia su entidad.
- Valores tipados por definición, uno por `(definición, entidad)`, con evidencia y fuente.
- El endpoint público siempre escribe con `source='human'`; el modelo y el servicio ya
  soportan `source='ai'` para cuando exista un llamador de confianza que lo use.

**Non-Goals:**
- UI de captura/edición en la SPA → change 11b `add-custom-fields-ui`.
- El motor de score en sí (Fase 3): aquí sólo se sientan los datos y la evidencia.
- Extracción automática por el pipeline/IA y cualquier endpoint que escriba `source='ai'`:
  no hay llamador todavía (no existe conexión LLM propia ni reglas de handoff configurable
  por administrador — eso es un roadmap propio, fuera de esta secuencia). El servicio queda
  listo para que ese futuro change sólo agregue el endpoint interno.
- Roles de usuario (reclutador/administrador), autenticación y permisos: no existen hoy en
  el sistema (no hay tabla de usuarios ni login); quedan fuera de este change.
- Campos calculados, fórmulas, o dependencias entre campos.

## Decisions

### 1. Dos tablas: definiciones y valores (no JSONB en lead/person)
`*_field_definitions` (el diccionario) y `*_field_values` (los datos). Los valores en tabla
aparte —no una columna JSONB en `leads`/`people`— porque el score necesitará consultar
"todos los valores de la definición X con su evidencia" y filtrar/agregar por campo; un
JSONB embebido lo haría opaco y sin integridad referencial hacia la definición.
- *Alternativa descartada*: `leads.custom` JSONB → simple de leer pero sin FK a la
  definición, sin unicidad por campo y sin lugar limpio para evidencia por dato.

### 2. Dos parejas de tablas por entidad, con FK real (no `entity` compartido)
`lead_field_definitions`/`lead_field_values` y `person_field_definitions`/
`person_field_values`, cada una con FK real a `leads.id` / `people.id` respectivamente
(`ON DELETE CASCADE`, ver Riesgos). Se prefiere esto sobre una sola pareja de tablas con
columna `entity` + `entity_id` sin FK real: la integridad referencial la garantiza Postgres,
no el servicio, y un borrado de lead/persona no puede dejar valores huérfanos silenciosos.
El costo es duplicar el esquema y el servicio (misma forma, distinto target) — aceptable
porque cada pareja es pequeña y el patrón ya está probado en catálogos.
- *Alternativa descartada*: `entity` como columna compartida + `entity_id` sin FK (como
  `channel_account` en multi-account-routing) → menos código pero sin integridad
  referencial real; se descarta explícitamente para este dominio porque el dato es más
  sensible (evidencia auditable) y el volumen de tablas no lo justifica.

### 3. `type` validado en dominio; `select` valida contra `options`
El `type` es `text` validado (no enum PG), coherente con la nota de diseño del schema. La
validación del `value` vive en el servicio: `number`→`Number.isFinite`, `boolean`→bool,
`date`→ISO-8601 parseable, `select`→pertenece a `options`, `text`→string. El error es
`VALIDATION_ERROR` (400) con los permitidos cuando aplica, mismo formato que
`CatalogValueService.assertValid`.

### 4. Caché de definiciones 60 s (patrón `catalog-value.service`)
El servicio de valores necesita la definición (tipo + options) en cada escritura; se
cachean las definiciones activas de cada entidad con TTL 60 s, invalidado al mutar el
diccionario. Mismo TTL que settings, reglas y catálogos.

### 5. Evidencia y precedencia de fuente en el valor; sólo `source='human'` expuesto hoy
Cada valor lleva `source` (`human` | `ai`), `evidenceText` y `evidenceMessageId`
opcionales, y el **servicio** `setValue()` aplica la regla de precedencia (project.md §2.2,
"la IA nunca decide"): una escritura `source='ai'` que apunte a un valor existente con
`source='human'` es no-op; una escritura `human` siempre gana y fija `source='human'`. Sin
embargo, en **este change** el único camino expuesto es el controller público, que llama a
`setValue()` con `source: 'human'` fijo en el código — nunca tomado del body — igual que
`actor` en `outbound.service`. No se agrega ningún endpoint capaz de pasar `source='ai'`:
hoy no hay LLM propio conectado ni reglas de administrador para el handoff bot→humano (eso
es un roadmap de auth/roles + LLM multi-proveedor que no existe todavía). Cuando ese
sistema se construya, su change sólo necesita un endpoint interno autenticado que llame al
mismo `setValue()` — el modelo y la regla de precedencia no cambian.

### 6. Endpoints de valores colgados de la entidad
Leer/escribir valores va por `/api/leads/:id/custom-fields[/:key]` y
`/api/people/:id/custom-fields[/:key]` (no un endpoint plano de valores) porque siempre se
opera en el contexto de un lead o persona concretos, y así el 404 de entidad inexistente es
natural. El CRUD del diccionario vive aparte en `/api/lead-field-definitions` y
`/api/person-field-definitions`. Rutas explícitas por entidad, no un `:entity`
paramétrico (NestJS 11/path-to-regexp v8 ya nos mordió con eso en `catalog-entries`).

### 7. Auditoría en `domain_events`
`lead_field.definition_created|updated|deleted`, `lead_field.value_set` y sus equivalentes
`person_field.*`, con `actor='user'` (único actor posible en este change). Es la traza que
el score auditará más adelante.

## Risks / Trade-offs

- [Un `select` cuya `options` se edita puede dejar valores viejos fuera del set] → No se
  borran ni migran valores al editar `options`; la lectura los devuelve tal cual y la UI
  (11b) marcará el desajuste. Documentado.
- [`ON DELETE CASCADE` borra valores si se borra el lead/persona] → Coherente con que hoy
  el sistema no borra leads/personas (los cierra); si en el futuro se permite borrar, perder
  sus custom fields junto con la entidad es el comportamiento esperado, no una fuga.
- [Duplicar esquema/servicio por entidad (lead vs person) cuesta más código que una tabla
  compartida] → Aceptado a cambio de integridad referencial real; el patrón es idéntico en
  ambas parejas así que el costo de mantenimiento es bajo.

## Migration Plan

1. Migración drizzle: crear `lead_field_definitions` (+ único `key`), `lead_field_values`
   (FK a `leads.id` ON DELETE CASCADE, FK a `lead_field_definitions.id`, único
   `(definition_id, lead_id)`), y sus dos equivalentes para `person`. Aditiva, sin tocar
   tablas existentes.
2. Sin backfill: no hay datos previos de campos personalizados.
3. Rollback: el código previo ignora las tablas nuevas; basta no exponer el módulo.

## Open Questions

- Ninguna bloqueante. (El sistema de roles/administrador + conexión LLM multi-proveedor que
  gobernará cuándo se escribe `source='ai'` y quién puede desconectar el bot es un roadmap
  propio, aún sin proponer — se abordará en su(s) propio(s) change(s).)
