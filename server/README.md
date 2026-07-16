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
drizzle/       Migraciones SQL versionadas (incluye trigger append-only y seeds)
test/          Tests de humo de la fundación + canales
```

## Webhooks de canales

| Ruta | Autenticidad | Notas |
|---|---|---|
| `GET /webhooks/meta` | `hub.verify_token` = `META_VERIFY_TOKEN` | Handshake de alta del webhook en Meta |
| `POST /webhooks/meta` | HMAC `X-Hub-Signature-256` con `META_APP_SECRET` (cuerpo crudo) | WhatsApp se procesa; Messenger/IG se ACKean (change futuro) |
| `POST /webhooks/telegram` | Header `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET` | Registrar con `setWebhook` + `secret_token` |

Reglas: sin secret configurado el endpoint responde 403; autenticado, SIEMPRE responde 200
aunque el payload no traiga mensajes procesables (statuses, edits) — Meta desactiva
webhooks que fallan. La ingestión es idempotente por `channel + external_message_id`:
los reintentos del proveedor no duplican mensajes ni eventos.

## Ingestión encolada y media

El webhook autentica, parsea y **encola** (`channels.inbound`, jobId
`canal:id-externo`); el worker ejecuta la ingestión idempotente + pipeline de leads.
El ACK no depende de Postgres: con la DB caída, los mensajes esperan en Redis.

Mensajes de **audio/voz/imagen/documento/video** se persisten con `messages.type` y
`messages.media` (estado `pending → stored | failed`). La cola `channels.media` descarga
el binario (WhatsApp: Graph API con `WHATSAPP_ACCESS_TOKEN`; Telegram: `getFile` con
`TELEGRAM_BOT_TOKEN`) y lo guarda vía `MediaStorage` (filesystem en `MEDIA_STORAGE_DIR`;
S3/MinIO cuando se decida despliegue). Sin token, la media queda `pending` sin romper
nada. Stickers/reacciones/ubicaciones se ACKean sin persistir.

## Reglas del repo que este backend hace cumplir

- Enums de negocio como texto validado en dominio, no enums de Postgres (configurables a futuro).
- `domain_events` es append-only a nivel de DB (trigger); toda métrica deriva de eventos.
- Timestamps `timestamptz` en UTC; los horarios se evalúan contra la TZ IANA del schedule.
- Errores de dominio siempre vía `DomainError` (código + mensaje), nunca strings.
