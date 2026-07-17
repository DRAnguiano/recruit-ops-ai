# add-api-for-spa

## Why

El backend ya ingiere mensajes, crea leads y descarga media, pero nada de eso es visible:
la SPA sigue leyendo IndexedDB y no existe ningún endpoint de lectura/escritura para las
vistas. Este change expone la API REST + WebSockets que la SPA necesita para operar contra
Postgres — el prerequisito directo de la meta F1 "la SPA lee de la API (adiós IndexedDB)".

**Alcance dividido**: la línea 5 de `openspec/project.md` §10 agrupa "API REST + WebSockets"
y "la SPA migra de IndexedDB a la API" en un solo change; eso excede el límite de ~12-15
tareas. Este change cubre **solo el backend** (API + tiempo real + asignación + toggle
bot/humano). La migración del frontend va en el change siguiente, `migrate-spa-to-api`;
`project.md` §10 se actualizará al archivar para reflejar la división.

## What Changes

- API REST bajo `/api` para todos los dominios que las vistas consumen: conversaciones y
  mensajes (inbox), leads (bandeja CRM), campañas, vacantes, agentes, operadores, flota,
  metas, horarios, reglas de clasificación y settings operativos.
- Convenciones transversales de API: DTOs validados con zod, forma estable de error
  (código de dominio + mensaje, sin stack), paginación por cursor en listados grandes,
  CORS configurable por env (`CORS_ALLOWED_ORIGINS`).
- Acciones de conversación: asignar/desasignar agente, toggle `attention_mode`
  (`human`|`bot`), cierre manual — cada una emite su `domain_event`.
- Acciones de lead con precedencia humana: cambio de estado, corrección de clasificación
  (marca `classification_source=human`), notas, vinculación manual lead→operador.
- Upsert masivo de operadores (`POST /api/operators/bulk`) para conservar el import de
  Excel (la SPA parsea, el backend persiste) y CRUD/bulk de campañas para el CSV fallback.
- WebSocket gateway (`/ws`) que retransmite a la SPA los eventos relevantes del inbox
  (mensaje entrante, media almacenada, lead creado/actualizado, conversación actualizada).
- La media almacenada se sirve por HTTP (`GET /api/messages/:id/media`) desde el
  `MediaStorage` para que el visor de chat reproduzca audios/imágenes.
- Sin cambios de esquema de datos previstos: las tablas de `add-backend-foundation` ya
  cubren todas las vistas.

Fuera de alcance (changes posteriores): envío de mensajes salientes (`add-outbound-messaging`),
sync de Marketing API (`add-campaign-sync`), autenticación de usuarios del CRM (la API nace
para red local/confiable; auth llegará antes de exponer a internet), y la migración de la SPA.

## Capabilities

### New Capabilities

- `api-conventions`: convenciones transversales de la API REST — prefijo `/api`, DTOs
  validados con zod, forma de error estable, paginación, CORS por env.
- `inbox-api`: listado y detalle de conversaciones con mensajes, asignación de agente,
  toggle de modo de atención, cierre manual y descarga de media por mensaje.
- `leads-api`: listado con filtros y detalle de leads; actualizaciones humanas (estado,
  clasificación con `classification_source=human`, notas, agente, operador vinculado).
- `catalog-api`: CRUD de campañas, vacantes, agentes, flota, metas, horarios, reglas de
  clasificación y settings; upsert masivo de operadores y campañas (imports que sobreviven).
- `realtime-updates`: gateway WebSocket que difunde eventos de dominio del inbox/pipeline
  a los clientes conectados.

### Modified Capabilities

- `backend-foundation`: nueva variable de entorno `CORS_ALLOWED_ORIGINS` (opcional, con
  default de desarrollo) en el esquema zod y `.env.example`.

## Impact

- **Código nuevo**: módulos NestJS de API por dominio (`server/src/api/` o controladores
  dentro de cada módulo de dominio existente — se decide en design.md), gateway WebSocket,
  DTOs zod compartidos.
- **Código tocado**: `env.ts` (CORS), `main.ts` (prefijo global, CORS, adaptador WS),
  módulos `conversations`/`leads`/`settings` existentes ganan métodos de consulta/comando.
- **Dependencias nuevas**: `@nestjs/websockets` + `@nestjs/platform-socket.io` (o `ws`);
  se decide en design.md.
- **Sin breaking changes**: los webhooks y workers existentes no cambian de contrato.
- **Consumidor**: la SPA (change siguiente `migrate-spa-to-api`); mientras tanto la API se
  verifica con tests e2e de supertest.
