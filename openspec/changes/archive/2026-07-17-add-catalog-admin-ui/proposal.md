# add-catalog-admin-ui — Proposal

## Why

El change `add-configurable-catalogs` dejó todos los catálogos de dominio (empresas,
circuitos, tipos de vacante, estados de lead), las metas por periodo y los settings como
datos editables **por API**, pero la SPA no tiene ninguna pantalla para administrarlos:
hoy solo se pueden tocar con curl. Peor: la bandeja de leads todavía tiene los estados
hardcodeados en español en los `<select>` (regla 1 violada en el frontend), así que un
estado nuevo creado por API ni siquiera aparece en la UI.

## What Changes

- **Nueva vista "Administración" en la SPA** (tab propio en el sidebar) con editores para
  los cuatro catálogos de dominio (`companies`, `circuits`, `vacancy-types`,
  `lead-statuses`): listar ordenado, crear (name+label), editar label/active/orden,
  borrar con manejo del 409 `RESOURCE_REFERENCED` (mensaje claro, sugerir desactivar).
  `name` inmutable en la UI (solo se captura al crear).
- **Editor de metas por periodo** en la misma vista: alta/edición/borrado de metas
  `weekly`/`monthly` por empresa + tipo de operador + circuito opcional, con selects
  alimentados por los catálogos y manejo del 409 por duplicado.
- **Settings operativos** en la misma vista: `conversation_inactivity_days` y el horario
  laboral (la edición de horario ya existente en Cobertura se enlaza/reubica aquí sin
  duplicar lógica).
- **Estados de lead desde el catálogo en toda la SPA**: el select de estatus y el filtro
  de la bandeja CRM, y cualquier otro dropdown de estado, se alimentan de
  `GET /api/lead-statuses` (label español del catálogo) en lugar de opciones
  hardcodeadas. El mapeo domain↔UI de estados deja de ser una tabla fija en
  `mappers.ts`.

## Capabilities

### New Capabilities

- `spa-catalog-admin`: vista de administración en la SPA para catálogos de dominio,
  metas por periodo y settings operativos, consumiendo la API de catálogos con manejo
  de errores tipados (400/409).

### Modified Capabilities

- `spa-api-client`: el mapeo de estados de lead deja de ser un diccionario fijo; los
  estados (name→label) se cargan del catálogo `lead-statuses` y los dropdowns de la
  SPA los reflejan sin cambios de código.

## Impact

- **SPA**: nuevo `src/components/AdminView.tsx` (+ subcomponentes de tabla de catálogo
  reutilizables), `Sidebar.tsx` (tab nuevo), `App.tsx` (carga de catálogos + wiring),
  `api/mappers.ts` (estados desde catálogo), `types.ts`.
- **Backend**: sin cambios (la API ya existe; `PATCH /api/settings` y work-schedules ya
  están expuestos).
- **Sin migraciones.**
