# migrate-spa-to-api — Proposal

## Why

El backend ya expone todo (inbox, leads, catálogos, envío, tiempo real) pero la Torre de
Control sigue leyendo IndexedDB: el usuario no puede VER nada de lo construido. Este change
cierra esa brecha — la SPA pasa a consumir la API y el inbox cobra vida — antes de seguir
agregando motor (campaign-sync se pospone un lugar con acuerdo del usuario, 2026-07-16).

## What Changes

- **La SPA deja IndexedDB**: `db.ts` y el seeding de datos por defecto se eliminan; toda
  lectura viene de la API REST (`VITE_API_BASE_URL`, default `http://localhost:3001`).
- **Capa de adaptación** (`src/api/`): cliente fetch tipado + mappers dominio-inglés ↔
  UI-español (`new`→`Nuevo`, `vacancy`→`Vacante`, `quinta_rueda`→`5ta Rueda`…). Las vistas
  existentes (Funnel, CRM, Atribución, Capacidad, Campañas, Cobertura) se conservan y
  siguen computando métricas en cliente sobre los listados (design add-api-for-spa §Non-Goals).
- **Visor de chat real**: al abrir un lead se cargan sus conversaciones y mensajes del
  backend (audios reproducibles vía `GET /api/messages/:id/media`), con composer que
  respeta `canSendFreeform`/ventana 24 h y envía por `POST /api/conversations/:id/messages`.
- **Escrituras van a la API**: status/notas/agente del lead (`PATCH /api/leads/:id`),
  vínculo con operador, CRUD de vacantes/flota/metas/horario y settings.
- **Imports que sobreviven**: Excel de operadores → `POST /api/operators/bulk`; CSV de
  campañas → `POST /api/campaigns/bulk`. El import de ZIPs de WhatsApp y el backup JSON
  se eliminan (los chats llegan por webhook; los datos viven en Postgres).
- **Tiempo real**: cliente WS (`/ws`) con reconexión; `message.received`/`lead.*`
  refrescan el inbox sin recargar.
- **Backend (menor)**: filtro `personId` en `GET /api/conversations`. La SPA corre en el
  puerto 5173 (default de Vite, ya cubierto por el CORS default); el 3000 quedó descartado
  porque lo ocupa Chatwoot en la máquina del usuario.

## Capabilities

### New

- `spa-api-client`: cliente HTTP tipado + mapeo dominio EN ↔ UI ES.
- `spa-live-inbox`: visor de chat con datos reales, envío y actualizaciones por WS.
- `spa-imports`: bulk de operadores/campañas desde el navegador vía API.

### Modified

- `inbox-api`: filtro `personId` en el listado de conversaciones.

## Impact

- **BREAKING para la SPA**: los datos locales de IndexedDB dejan de usarse (quedan en el
  navegador pero la app ya no los lee). Los datos reales viven en Postgres.
- **Código SPA**: `App.tsx` (carga y escrituras), `ImportModule.tsx` (bulk), `db.ts` y
  `defaultData.ts` eliminados; nuevo `src/api/`.
- **Backend**: cambio menor en conversations (filtro personId); sin migraciones.
- **Sin auth todavía** (red confiable, igual que la API); llega como change propio.
