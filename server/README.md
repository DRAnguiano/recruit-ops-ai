# Backend — CRM de Reclutamiento Omnicanal

Monolito modular en NestJS + PostgreSQL (Drizzle) + Redis (BullMQ). Fundación creada por el
change OpenSpec `add-backend-foundation`; el contexto de arquitectura vive en
`../openspec/project.md`.

## Arranque desde clone limpio

Requisitos: Node 22+, Docker.

```bash
# 1. Infraestructura local (Postgres 16 + Redis 7), desde la raíz del repo
docker compose up -d --wait

# 2. Variables de entorno (los valores de ejemplo ya apuntan al docker-compose)
cp ../.env.example ../.env

# 3. Dependencias
cd server && npm install

# 4. Migraciones (único mecanismo de cambio de esquema)
npm run db:migrate

# 5. Backend en modo desarrollo → http://localhost:3001/health
npm run dev
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | NestJS en watch mode |
| `npm run build` / `npm start` | Compila a `dist/` y arranca producción |
| `npm run lint` | Typecheck estricto (`tsc --noEmit`) |
| `npm test` | Suite Vitest (necesita los contenedores arriba; usa DBs efímeras) |
| `npm run db:generate` | Genera migración SQL desde `src/database/schema.ts` |
| `npm run db:migrate` | Aplica migraciones de `drizzle/` |

## Estructura

```
src/
  config/      env.ts (zod: el proceso no arranca con config inválida)
  common/      DomainError tipado + filtro HTTP
  database/    DatabaseModule (Drizzle/postgres.js), schema.ts, migrate.ts
  redis/       RedisModule (ioredis compartido)
  events/      DomainEventsService — event log append-only (única vía de escritura)
  jobs/        QueueRegistryService — colas BullMQ `dominio.cola`
  health/      GET /health (proceso, Postgres, Redis)
  channels/    Webhooks omnicanal: adaptadores, guards de firma, ingestión
  conversations/ API del inbox: conversaciones, mensajes, comandos, media
  leads/       Pipeline determinista + API de bandeja de leads
  catalog/     CRUD de catálogos operativos, settings y bulk imports
drizzle/       Migraciones SQL versionadas (incluye trigger append-only y seeds)
test/          Tests de humo de la fundación + canales + API
```

## Webhooks de canales

| Ruta | Autenticidad | Notas |
|---|---|---|
| `GET /webhooks/meta` | `hub.verify_token` = `META_VERIFY_TOKEN` | Handshake de alta del webhook en Meta |
| `POST /webhooks/meta` | HMAC `X-Hub-Signature-256` con `META_APP_SECRET` (cuerpo crudo) | WhatsApp (`whatsapp_business_account`), Messenger (`page`) e Instagram (`instagram`) |
| `POST /webhooks/telegram` | Header `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET` | Registrar con `setWebhook` + `secret_token` |

Reglas: sin secret configurado el endpoint responde 403; autenticado, SIEMPRE responde 200
aunque el payload no traiga mensajes procesables (edits, reacciones) — Meta desactiva
webhooks que fallan. Los `statuses` de WhatsApp se procesan como estados de entrega (ver
envío saliente). La ingestión es idempotente por `channel + external_message_id`:
los reintentos del proveedor no duplican mensajes ni eventos.

## Ingestión encolada y media

El webhook autentica, parsea y **encola** (`channels.inbound`, jobId
`canal__id-externo`); el worker ejecuta la ingestión idempotente + pipeline de leads.
El ACK no depende de Postgres: con la DB caída, los mensajes esperan en Redis.

Mensajes de **audio/voz/imagen/documento/video** se persisten con `messages.type` y
`messages.media` (estado `pending → stored | failed`). La cola `channels.media` descarga
el binario (WhatsApp: Graph API con `WHATSAPP_ACCESS_TOKEN`; Telegram: `getFile` con
`TELEGRAM_BOT_TOKEN`) y lo guarda vía `MediaStorage` (filesystem en `MEDIA_STORAGE_DIR`;
S3/MinIO cuando se decida despliegue). Sin token, la media queda `pending` sin romper
nada. Stickers/reacciones/ubicaciones se ACKean sin persistir.

## Messenger e Instagram

Los eventos `object=page` / `object=instagram` del mismo webhook de Meta se ingieren como
canales `messenger` / `instagram`: texto, adjuntos (audio/imagen/video/archivo) y el
`referral` de anuncios click-to-Messenger (atribución de campaña por `ad_id`). La
identidad es el PSID/IGSID — el webhook no trae teléfono ni nombre y **no se inventan**;
la persona se crea solo con su channel identity y la reclutadora captura el resto. Los
adjuntos llegan como URL firmada de CDN y se descargan de inmediato por la cola de media
(sin token; si la firma expiró quedan `failed`). Echoes y eventos delivery/read se ACKean
sin persistir.

Para **responder** se usa la Send API con `META_PAGE_ID` + `META_PAGE_ACCESS_TOKEN`
(la cuenta IG profesional conectada a la página; mismo token con permiso
`instagram_manage_messages`). Solo texto dentro de la ventana de 24 h; estos canales no
tienen plantillas (409 `TEMPLATES_NOT_SUPPORTED`).

## Envío saliente (ventana 24 h y plantillas)

`POST /api/conversations/:id/messages` envía texto libre (`{ body }`) o plantilla
(`{ templateId, variables }`) por el canal de la conversación (WhatsApp Cloud API y
Telegram). El mensaje se **persiste primero** (`delivery.status='queued'`) y la cola
`channels.outbound` lo entrega con reintentos; al enviarse guarda el id real del canal y
pasa a `sent`. Reintentos agotados → `failed` con el error.

**Ventana de 24 h (canales Meta)**: el backend la impone en WhatsApp, Messenger e
Instagram — texto libre solo dentro de las 24 h del último mensaje entrante; fuera de
ella responde 409 `WINDOW_EXPIRED`. Solo WhatsApp tiene plantillas aprobadas como
alternativa fuera de ventana. El detalle de conversación expone `canSendFreeform` y
`windowExpiresAt`. Telegram no tiene ventana.

**Plantillas** (`/api/message-templates`): catálogo configurable (nombre, idioma, cuerpo
con `{{1}}…{{n}}`, conteo de variables, estado). Al enviar, el backend valida variables,
renderiza el cuerpo para el historial y arma el payload `template` de la Cloud API.

**Estados de entrega**: los webhooks `statuses` de WhatsApp actualizan
`messages.delivery` (`queued → sent → delivered → read`, o `failed` con el error de Meta)
con avance monotónico e idempotente, emiten `message.delivery_updated` y llegan al inbox
en vivo por el WS. Env necesaria para enviar por WhatsApp: `WHATSAPP_ACCESS_TOKEN` +
`WHATSAPP_PHONE_NUMBER_ID`; sin ellos el endpoint responde 409 `CHANNEL_NOT_CONFIGURED`.

## Sync de campañas (Meta Marketing API, read-only)

Con `META_ADS_ACCESS_TOKEN` (permiso `ads_read`) y `META_AD_ACCOUNT_ID` configurados, un
job repetible (`campaigns.sync`, intervalo por setting `campaign_sync_interval_minutes`,
default 60 min) trae campañas reales: gasto, clicks, leads reportados y la **moneda de la
cuenta** (`campaigns.spend` + `currency`, default USD). Upsert por `externalId`: adopta
campañas CSV con el mismo id (los datos reales ganan) sin tocar campos locales
(`targetAgentId`, `vacancyId`, `modality`); campañas sin `externalId` jamás se tocan.
Tras cada sync se **re-atribuyen** los leads con referral huérfano cuya campaña ya existe.
`POST /api/campaigns/sync` dispara una corrida inmediata (202; sin credenciales → 409
`MARKETING_NOT_CONFIGURED`). Nunca se escriben datos en Meta ni se inventan métricas:
sin token, el CSV sigue siendo el único origen.

## Bot gateway (contrato v1 para el FastAPI externo)

Con `BOT_WEBHOOK_URL` y `BOT_SHARED_SECRET` configurados, el CRM conecta el bot LLM
externo. **La IA nunca decide**: recibe mensajes y solo puede responder, extraer datos con
evidencia o pedir handoff — todo validado por el backend. Ambas direcciones firman el
cuerpo crudo con HMAC-SHA256 (header `X-Bot-Signature: sha256=<hex>`).

**CRM → bot** — POST a `BOT_WEBHOOK_URL` por cada mensaje entrante de conversaciones en
modo bot (texto al ingerir; audio/imagen cuando su binario ya es descargable), con
reintentos; un bot caído nunca afecta la ingestión:

```json
{
  "contractVersion": 1,
  "event": "message.received",
  "conversation": { "id": "…", "channel": "whatsapp", "attentionMode": "bot",
                    "canSendFreeform": true, "windowExpiresAt": "…" },
  "person": { "id": "…", "name": "…", "phone": "+52…" },
  "lead": { "id": "…", "classification": "vacancy", "detectedVacancyType": "quinta_rueda",
            "status": "new" },
  "message": { "id": "…", "type": "audio", "body": null, "sentAt": "…",
               "mediaUrl": "http://…/api/messages/<id>/media" }
}
```

**Bot → CRM** — `POST /bot/v1/actions` (fuera del prefijo `/api`; 403 sin firma válida),
máximo 5 acciones por request, respuesta `{ results: [{action, ok, error?}] }`:

| Acción | Payload | Reglas |
|---|---|---|
| `send_message` | `{conversationId, body}` | Mismo pipeline saliente (ventana 24 h incluida) con `actor='bot'`; requiere modo bot vigente — lock atómico: si una reclutadora tomó la conversación, responde `BOT_NOT_ACTIVE` |
| `extract_data` | `{conversationId, fields: [{key, value, evidence: {quote, messageId}}]}` | Evidencia verificable: `messageId` de esa conversación y `quote` presente en el texto (en media la cita puede ir vacía); persiste evento `lead.data_extracted` sin mutar el lead |
| `request_handoff` | `{conversationId, reason}` | Pasa a `attentionMode='human'` (evento actor bot, visible por WS); el bot no puede re-encenderse — solo el toggle humano |

Env opcional `PUBLIC_BASE_URL` controla la base de `mediaUrl` (útil con ngrok).

## API REST para la SPA (`/api`)

Todo endpoint de UI vive bajo el prefijo `/api` (`/health` y `/webhooks/*` quedan fuera).
CORS se restringe a `CORS_ALLOWED_ORIGINS` (coma-separado; default: Vite dev). Sin auth
todavía: pensada para red confiable; auth llegará como change propio antes de exposición
pública. Los valores de dominio van en inglés (`new`, `in_progress`, `human`, `bot`…); la
SPA traduce a español.

**Paginación keyset**: los listados grandes aceptan `?limit=&cursor=` y responden
`{ items, nextCursor }` (`nextCursor: null` en la última página). Los catálogos chicos
devuelven la lista completa.

**Errores**: siempre `{ code, message }` tipado — 400 `VALIDATION_ERROR` (con `issues`),
404 `*_NOT_FOUND`, 409 (`RESOURCE_REFERENCED`, `CONVERSATION_ALREADY_CLOSED`…).

| Recurso | Endpoints |
|---|---|
| Inbox | `GET /api/conversations` (filtros: status, channel, assignedAgentId, attentionMode) · `GET /api/conversations/:id` · `GET /api/conversations/:id/messages` |
| Comandos de inbox | `POST /api/conversations/:id/assign` `{agentId\|null}` · `POST .../attention-mode` `{mode: human\|bot}` · `POST .../close` · `POST .../messages` (envío saliente) |
| Media | `GET /api/messages/:id/media` — streamea el binario `stored` con su mime |
| Leads | `GET /api/leads` (filtros: status, classification, detectedVacancyType, assignedAgentId, origin, campaignId, firstMessageFrom/To) · `GET /api/leads/:id` (persona, métricas, campaña, operador) · `PATCH /api/leads/:id` (status/notes/agente/clasificación → `classificationSource=human`) · `POST /api/leads/:id/operator` `{operatorId\|null}` |
| Catálogos | CRUD en `/api/campaigns`, `/api/vacancies`, `/api/agents`, `/api/operators`, `/api/fleet`, `/api/goals`, `/api/work-schedules`, `/api/classification-rules` — DELETE referenciado responde 409 |
| Catálogos de dominio | CRUD en `/api/companies`, `/api/circuits`, `/api/vacancy-types`, `/api/lead-statuses` (`name` de dominio inmutable + `label` de UI + `active` + orden). Empresa/circuito/tipo/estado se validan contra estos catálogos (cache 60 s), nunca contra enums en código; sembrados desde los datos existentes |
| Settings | `GET /api/settings` · `PUT /api/settings/:key` (claves registradas, ej. `conversation_inactivity_days`) |
| Metas | `/api/goals` por periodo: `periodKind` (`weekly`\|`monthly`), empresa + tipo de operador + circuito opcional, única por combinación (duplicado → 409 `DUPLICATE_RESOURCE`) |
| Bulk | `POST /api/operators/bulk` (upsert por `empNo`) · `POST /api/campaigns/bulk` (por `externalId` o `name`+`isoWeek`, `source=csv`) — responden `{created, updated}`, reimportar es no-op |

Toda mutación por API emite su `domain_event` con `actor='user'` (auditable en el event log).

## Tiempo real (`/ws`)

WebSocket nativo (sin socket.io) en `ws://host/ws`. El servidor difunde a todos los
clientes frames `{ type, payload }` con los eventos de dominio ya persistidos
(`message.received`, `message.media_stored`, `lead.created`, `lead.updated`,
`conversation.assigned`, `conversation.attention_mode_changed`, `conversation.closed`…).
El payload lleva `aggregateId` y los datos del evento — nunca rutas internas de storage.
Difusión fire-and-forget: un cliente roto no afecta la ingestión; la reconexión y el
re-fetch tras reconectar son responsabilidad del cliente.

## Reglas del repo que este backend hace cumplir

- Enums de negocio como texto validado en dominio, no enums de Postgres (configurables a futuro).
- `domain_events` es append-only a nivel de DB (trigger); toda métrica deriva de eventos.
- Timestamps `timestamptz` en UTC; los horarios se evalúan contra la TZ IANA del schedule.
- Errores de dominio siempre vía `DomainError` (código + mensaje), nunca strings.
