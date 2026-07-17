# migrate-spa-to-api — Design

## Context

La SPA (React 19 + Vite, `src/`) concentra estado y vistas en `App.tsx` (~1.4k líneas):
carga todo de IndexedDB al montar, computa métricas en cliente y escribe de vuelta a
IndexedDB. El dominio de la UI está en español (`ChatLead`, `Vacante`, `Nuevo`…) y los
leads embeben sus mensajes. El backend ya expone la API completa con dominio en inglés.

## Goals / Non-Goals

**Goals:**

- Reemplazar TODAS las lecturas/escrituras de IndexedDB por la API, conservando las vistas
  y las métricas en cliente tal como están.
- Inbox vivo: mensajes nuevos visibles sin recargar; visor de chat con historial real,
  audios y envío con política de ventana.
- Imports de operadores (Excel) y campañas (CSV) vía bulk endpoints idempotentes.

**Non-Goals:**

- Rediseñar la UI, mover métricas al backend o introducir un state manager nuevo — la
  estructura de `App.tsx` se respeta (adaptador, no reescritura).
- Autenticación (change propio previo a exposición pública).
- Paginación en UI: los volúmenes actuales (miles) permiten cargar listados completos,
  como hoy; la API ya pagina y el cliente re-consume `nextCursor` hasta agotar.

## Decisions

### 1. Capa de adaptación en `src/api/`, la UI no cambia de tipos

`client.ts` (fetch tipado con `VITE_API_BASE_URL`, default `http://localhost:3001`;
errores `{code,message}` propagados; helper `fetchAllPages` que sigue `nextCursor`) y
`mappers.ts` (API → tipos existentes de `types.ts` y viceversa). Diccionarios de
traducción explícitos: status (`new`↔`Nuevo`…), clasificación (`vacancy`↔`Vacante`…),
tipo de vacante (`quinta_rueda`↔`5ta Rueda`…), origin (`paid`↔`Facebook`,
`organic`↔`Orgánico`), modalidad, empresa pasa tal cual. Así el diff en `App.tsx` y las
vistas es mínimo y el rediseño de tipos queda para cuando los estados sean catálogo
configurable (change 10).

### 2. `ChatLead` se arma desde `/api/leads`; los mensajes se cargan al abrir el chat

`GET /api/leads` ya trae persona, métricas, clasificación y atribución → mapea 1:1 a los
campos de `ChatLead` (el teléfono UI son los últimos 10 dígitos del E.164). `messages`
arranca vacío y `lastContactDate`/`agent` se derivan de los campos del lead. Al abrir el
visor: `GET /api/conversations?personId=` + `GET /api/conversations/:id/messages`
(todas las páginas) → burbujas reales; audio/imagen/documento renderizan con
`GET /api/messages/:id/media` (elemento `<audio>`/`<img>`/link). Evita descargar todos
los hilos por adelantado.

Backend: `GET /api/conversations` gana filtro `personId` (delta inbox-api) — cambio de
una condición más en el listado ya filtrable.

### 3. Escrituras optimistas simples: PATCH y refetch puntual

Cambios de status/notas/agente del lead → `PATCH /api/leads/:id` con el mapper inverso;
vínculo manual → `POST /api/leads/:id/operator`. La respuesta del backend (fuente de
verdad) reemplaza el lead en el estado local. Catálogos (vacantes, flota, metas, horario,
settings) → endpoints de catalog con el mismo patrón. Sin colas offline: si la API falla,
se muestra el error tipado y el estado no cambia.

### 4. WS con re-sync selectivo, no event-sourcing en el cliente

Cliente `src/api/realtime.ts`: WebSocket a `/ws` con reconexión (backoff 1s→30s) y
callback por tipo de evento. Política simple: `message.received`, `conversation.*` y
`lead.*` disparan un refetch de leads (debounced 2 s) y, si el visor está abierto sobre
esa conversación, de sus mensajes. Con los volúmenes actuales un refetch es barato y
elimina toda la lógica de merge; si duele, se optimiza después sin cambiar contrato.

### 5. Los imports de chats desaparecen; operadores y campañas quedan

`ImportModule` conserva el parseo en navegador (SheetJS/CSV ya existente) pero persiste
vía `POST /api/operators/bulk` y `POST /api/campaigns/bulk` mostrando `{created, updated}`.
Las secciones de ZIP de WhatsApp, backup/restore JSON y "borrar base local" se eliminan
con un aviso de que los chats llegan por webhook. `defaultData.ts` y `db.ts` se borran:
si la API no responde, la app muestra el error de conexión — nunca datos falsos.

### 6. Puerto del dev server: 5173 (el 3000 lo ocupa Chatwoot)

En la máquina del usuario chatwoot_rails escucha en :3000, así que el script `dev` de la
SPA usa el puerto 5173 (default de Vite), ya cubierto por el default de
`CORS_ALLOWED_ORIGINS`. Regla operativa: verificar puertos con `docker ps` antes de asignar.

## Risks / Trade-offs

- **[Refetch por evento WS]** Más tráfico que un merge incremental → aceptable al volumen
  actual; debounce lo acota; optimizable después.
- **[Doble catálogo de labels]** Los diccionarios ES viven en `mappers.ts` hasta que los
  estados sean configurables (change 10), que ya prevé mover labels a datos.
- **[Sin tests automatizados de UI]** La SPA no tiene infra de tests; el gate es
  `tsc`/`vite build` + verificación manual E2E (webhook → UI en vivo). Los cambios de
  backend sí llevan test (filtro personId).

## Migration Plan

Deploy = servir la SPA nueva apuntando al backend. IndexedDB queda huérfana (sin borrado
activo). Rollback = versión anterior de la SPA (el backend no cambia contratos).

## Open Questions

- Ninguna bloqueante.
