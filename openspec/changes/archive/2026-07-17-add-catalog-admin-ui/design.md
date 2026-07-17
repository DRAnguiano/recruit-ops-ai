# add-catalog-admin-ui — Design

## Context

Toda la API necesaria ya existe (`add-configurable-catalogs`): CRUD de
`/api/companies|circuits|vacancy-types|lead-statuses` (name inmutable, DELETE
referenciado → 409 `RESOURCE_REFERENCED`), `/api/goals` por periodo (409 por duplicado),
`GET /api/settings` + `PUT /api/settings/:key` (registro con
`conversation_inactivity_days` y `campaign_sync_interval_minutes`) y
`/api/work-schedules`. La SPA (React 19 + Vite + Tailwind) tiene 7 tabs en `Sidebar.tsx`
y un `App.tsx` que carga todo por API al montar; pero los estados de lead están
hardcodeados en español en dos `<select>` y en `mappers.ts` como diccionario fijo.

## Goals / Non-Goals

**Goals:**

- Tab "Administración" para editar los 4 catálogos de dominio, metas por periodo y
  settings desde la UI.
- Dropdowns de estado de lead alimentados por el catálogo (fin del hardcodeo en la SPA).
- Manejo claro de errores tipados: 400 con `issues`, 409 referenciado/duplicado.

**Non-Goals:**

- Cambios de backend o migraciones (la API ya cubre todo).
- Credenciales por canal (10c) y campos personalizados (11).
- Editar catálogos operativos que ya tienen vista propia (campañas, vacantes, flota,
  operadores siguen donde están).
- Roles/permisos de acceso al tab (no hay auth de usuarios todavía en la SPA).

## Decisions

### 1. Un componente genérico `CatalogTable` para los 4 catálogos

Los cuatro comparten forma (`name`, `label`, `active`, `sortOrder`), así que un solo
componente recibe `{ endpoint, título }` y resuelve listar/crear/editar/borrar. `name`
solo se captura en el alta (inmutable después, igual que la API); `active` es un toggle;
el orden se edita como número. Un 409 al borrar muestra el mensaje del backend y sugiere
desactivar en su lugar. Nada de estado optimista: cada mutación recarga desde la
respuesta del backend (patrón existente de la SPA).

### 2. Estados de lead como dato cargado, no diccionario

`App.tsx` carga `GET /api/lead-statuses` junto con el resto del boot y lo baja por props.
`mappers.ts` deja el mapa fijo de estados y expone `leadStatusLabel(name, catalog)` /
`leadStatusToApi(label, catalog)` construidos desde el catálogo (fallback: mostrar el
`name` crudo si una fila histórica trae un estado ya inactivo). Los dos `<select>`
hardcodeados (filtro y fila de la bandeja CRM) y el badge de conteo del sidebar
(`status === 'Nuevo'`) pasan a derivarse del catálogo — el conteo usa `name === 'new'`,
que es la entrada sembrada garantizada por el pipeline.

### 3. Metas por periodo: editor propio dentro del tab

Formulario con selects de empresa/tipo/circuito (desde los catálogos, `circuit`
opcional), `periodKind` y `target`; tabla agrupada por periodo. El 409 de duplicado se
muestra en línea. La vista Capacidad sigue leyendo solo `periodKind='monthly'` (sin
cambios); las metas semanales viven aquí.

### 4. Settings en el mismo tab, horario laboral sin duplicar

El tab lista las claves de `GET /api/settings` con inputs numéricos validados por la API
(`PUT /api/settings/:key`). El editor de horario laboral ya existente (hoy en Cobertura
vía `handleSaveSettings`) se reutiliza: el mismo formulario se renderiza en
Administración y se retira de Cobertura para tener una sola puerta de entrada.

## Risks / Trade-offs

- **[Catálogo inactivo en datos históricos]** leads con estado desactivado: el label se
  resuelve igual (el catálogo lista también inactivos para lectura) y solo los activos
  aparecen como opciones de escritura.
- **[Cache 60 s del backend]** una entrada recién creada puede tardar ≤60 s en ser
  válida al escribir leads/vacantes; la UI ya la muestra (lee directo del CRUD). Riesgo
  aceptado y documentado en 10a.
- **[Sin auth]** cualquier usuario de la SPA puede editar catálogos; igual que el resto
  de la app hoy — roles llegarán con un change posterior.

## Migration Plan

Solo frontend; sin migraciones ni cambios de env. Deploy normal de la SPA.

## Open Questions

- Ninguna bloqueante.
