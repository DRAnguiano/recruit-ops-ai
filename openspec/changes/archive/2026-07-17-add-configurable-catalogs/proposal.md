# add-configurable-catalogs — Proposal

## Why

La regla 1 del proyecto ("nada de negocio hardcodeado") todavía tiene deudas: los estados
de lead viven en un `z.enum` del controller, los tipos de vacante son un comentario en el
schema, y empresa/circuito son texto libre repetido en vacantes, operadores, flota y
metas. Además las metas son solo mensuales por empresa+tipo — el usuario pidió metas
semanales por empresa+tipo+circuito, registrar el tipo de operador contratado
(full/sencillo) y su circuito, y poder editar la moneda de cada campaña. Todo eso debe
ser dato configurable, no código.

## What Changes

- **Cuatro catálogos nuevos como tablas** con CRUD en `/api`: `companies`, `circuits`,
  `vacancy-types` y `lead-statuses` (con `name` de dominio en inglés, `label` para UI,
  `active` y orden). Se siembran desde los valores hoy existentes (empresas/circuitos
  distintos en datos, los 4 tipos de vacante, los 6 estados de lead actuales).
- **Validación contra catálogo, no contra enums**: el `status` de un lead, el
  tipo/circuito/empresa de una vacante y el tipo/circuito del operador contratado se
  validan contra el catálogo (cache 60 s, mismo patrón que las reglas de clasificación).
  Borrar una entrada referenciada responde 409 `RESOURCE_REFERENCED`; el pipeline sigue
  usando `new` como estado inicial (entrada sembrada protegida).
- **Metas por periodo**: `monthly_goals` se generaliza a `goals` con
  `periodKind` (`weekly` | `monthly`), empresa, tipo de operador y circuito opcional;
  única por combinación. La migración conserva las metas mensuales existentes.
- **Operador contratado**: `operators` gana `operatorType` y `circuit` (opcionales,
  validados contra catálogo) para registrar qué se contrató y dónde.
- **Moneda editable por campaña**: `PATCH /api/campaigns/:id` acepta `currency`
  (ISO-4217); el sync de Meta sigue mandando sobre campañas `meta_api`.

**Split del change 10 de project.md §10** (respetando atomicidad ~12-15 tareas): este
change cubre datos+API; la UI de administración de catálogos será
`add-catalog-admin-ui` y las credenciales por canal cifradas `add-channel-credentials`
(ambos quedan anotados en la secuencia).

## Capabilities

### New Capabilities

- `configurable-catalogs`: catálogos operativos como datos (empresas, circuitos, tipos
  de vacante, estados de lead) con siembra desde valores existentes, validación cacheada
  y protección de entradas referenciadas.

### Modified Capabilities

- `catalog-api`: nuevos recursos CRUD (`/api/companies`, `/api/circuits`,
  `/api/vacancy-types`, `/api/lead-statuses`), metas por periodo en `/api/goals`, y
  `currency` editable en campañas.
- `leads-api`: el `status` del lead se valida contra el catálogo `lead-statuses` en vez
  del enum fijo (el filtro de listado acepta cualquier estado del catálogo).

## Impact

- **Migración de schema**: 4 tablas nuevas + seeds; `monthly_goals` → `goals` (datos
  preservados); `operators.operator_type` y `operators.circuit`.
- **Código**: `catalog/` (schemas zod + endpoints nuevos + servicio de validación
  cacheado), `leads/leads.controller.ts` (status desde catálogo), sin cambios en
  ingestión/canales.
- **SPA**: sin cambios en este change (los mappers actuales siguen funcionando; las
  metas mensuales existentes conservan su forma en la API con `periodKind`).
- **Secuencia**: añade 10b `add-catalog-admin-ui` y 10c `add-channel-credentials` a §10.
