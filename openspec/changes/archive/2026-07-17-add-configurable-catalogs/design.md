# add-configurable-catalogs — Design

## Context

El CRUD de catálogos existe (`catalog-api`: campañas, vacantes, agentes, operadores,
flota, metas, horarios, reglas) con un patrón asentado: `catalog.schemas.ts` (zod),
`CatalogCrudService` genérico, DELETE referenciado → 409. Pero los valores de dominio
que esos recursos usan (empresa, circuito, tipo de vacante, estado de lead) son texto
libre o enums hardcodeados. Las reglas de clasificación ya demostraron el patrón
correcto: catálogo en tabla + cache 60 s + seeds de migración.

## Goals / Non-Goals

**Goals:**

- Empresas, circuitos, tipos de vacante y estados de lead como tablas editables por API.
- Validación de dominio contra catálogo con cache (nunca enums en código).
- Metas semanales/mensuales por empresa+tipo+circuito; tipo/circuito del contratado.
- Moneda editable por campaña.

**Non-Goals:**

- UI de administración (change 10b `add-catalog-admin-ui`).
- Credenciales por canal cifradas (change 10c `add-channel-credentials`).
- Migrar `company`/`circuit` de texto a FK uuid en tablas existentes: se validan por
  `name` contra el catálogo al escribir; la normalización referencial completa llegaría
  con un change de datos propio si hiciera falta.
- Renombrar estados en cascada (renombrar una entrada no reescribe leads históricos).

## Decisions

### 1. Forma común de catálogo: `name` + `label` + `active` + `sortOrder`

Las 4 tablas comparten forma: `name` (identificador de dominio en inglés/slug, único,
inmutable tras crear), `label` (texto para UI en español), `active` (soft-hide para
selects sin romper datos históricos) y `sortOrder`. Los datos existentes referencian
`name` — por eso `name` no se edita: se desactiva y se crea otro (regla simple que evita
reescrituras en cascada).

### 2. Seeds desde los datos reales, no inventados

La migración siembra: `lead_statuses` con los 6 actuales (new, in_progress, documents,
hired, discarded, no_response) con sus labels de la SPA; `vacancy_types` con
sencillo/full/quinta_rueda/escuelita; `companies` y `circuits` con `SELECT DISTINCT` de
vacantes/operadores/flota/metas (lo que ya está en datos ES el catálogo inicial).

### 3. `CatalogValueService` con cache de 60 s

Un servicio (`isValid(kind, name)` / `activeNames(kind)`) cachea cada catálogo 60 s
(mismo TTL que settings y reglas). Los controllers validan con
`z.string()` + chequeo asíncrono → 400 `VALIDATION_ERROR` con el catálogo permitido en
`issues`. El default del pipeline (`new`) queda garantizado: `lead_statuses.name='new'`
es entrada sembrada y el DELETE de una entrada referenciada por leads responde 409
`RESOURCE_REFERENCED` (patrón existente).

### 4. `goals` reemplaza `monthly_goals` conservando datos

Nueva tabla `goals`: `periodKind` (`weekly`|`monthly`), `company`, `vacancyType`,
`circuit` (nullable), `target`, única por (periodKind, company, vacancyType, circuit) —
con circuit NULL tratado como valor en la unicidad (índice sobre
`COALESCE(circuit,'')`). La migración inserta las filas de `monthly_goals` como
`periodKind='monthly'` y elimina la tabla vieja. `/api/goals` mantiene el contrato
actual + campos nuevos; el mapper de la SPA no se rompe porque los campos previos
conservan nombre y significado.

### 5. Moneda por campaña editable, el sync manda en `meta_api`

`PATCH /api/campaigns/:id` acepta `currency` (regex `^[A-Z]{3}$`). Para campañas
`source='meta_api'` el sync periódico sigue escribiendo la moneda real de la cuenta (la
edición manual aplica a `csv`/`manual`, donde no hay fuente mejor que el usuario).

## Risks / Trade-offs

- **[Texto libre histórico]** filas viejas con empresas/circuitos que nadie sembró: la
  siembra por DISTINCT lo minimiza; si algo queda fuera, el catálogo se edita por API.
- **[Cache 60 s]** una entrada recién creada tarda ≤60 s en ser válida en otros
  endpoints; aceptable y consistente con settings/reglas.
- **[Unicidad con circuit NULL]** el índice por COALESCE evita duplicados
  weekly+empresa+tipo sin circuito; documentado en el schema.
- **[SPA sin UI aún]** los catálogos solo se editan por API hasta 10b; el sistema sigue
  operable porque todo está sembrado.

## Migration Plan

Una migración: crear 4 tablas + seeds; crear `goals`, copiar `monthly_goals`
(`periodKind='monthly'`, circuit NULL) y dropear la vieja; `ALTER operators` con las 2
columnas nuevas. Reversible solo hacia adelante (patrón del repo). Sin cambios de env.

## Open Questions

- Ninguna bloqueante.
