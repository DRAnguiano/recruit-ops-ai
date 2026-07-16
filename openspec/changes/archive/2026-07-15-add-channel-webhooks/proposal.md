# add-channel-webhooks

## Why

La razón de ser de la migración es que los leads lleguen solos: hoy no hay ninguna vía de
entrada de mensajes al backend recién creado. Este change implementa la puerta de entrada
omnicanal — el webhook de Meta (WhatsApp Cloud API primero) y el de Telegram — con
normalización común (`ChannelAdapter`) e ingestión idempotente hacia el esquema ya migrado
(`people`, `channel_identities`, `conversations`, `messages`). Es el change 2 de la
secuencia de `openspec/project.md` §10.

## What Changes

- Endpoint `GET /webhooks/meta` para la verificación de Meta (`hub.mode`,
  `hub.verify_token`, `hub.challenge`).
- Endpoint `POST /webhooks/meta` con validación obligatoria de firma
  `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con el app secret); en este change
  solo se procesan eventos de WhatsApp (`whatsapp_business_account`) — Messenger e
  Instagram se reconocen y se ACKean sin procesar (llegan en `add-channels-messenger-instagram`).
- Endpoint `POST /webhooks/telegram` con validación del header
  `X-Telegram-Bot-Api-Secret-Token`.
- Interfaz `ChannelAdapter` + adaptadores WhatsApp y Telegram que normalizan el payload
  crudo a un mensaje entrante común (id externo, identidad del remitente, teléfono si
  existe, texto, timestamp, payload crudo intacto).
- Servicio de ingestión idempotente: upsert de persona (dedup por teléfono E.164 cuando el
  canal lo da), identidad de canal, conversación abierta por persona+canal, inserción de
  mensaje idempotente por `channel + external_message_id`, y emisión de eventos de dominio
  (`person.created`, `conversation.started`, `message.received`).
- Los webhooks SIEMPRE responden 200 rápido cuando la autenticidad es válida, aunque el
  payload no traiga mensajes procesables (statuses, edits, etc. se ignoran con evento no,
  se ACKean sin efecto).
- Nuevas variables de entorno opcionales por canal (`META_APP_SECRET`,
  `META_VERIFY_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`): un canal sin configurar responde 404/403
  sin exponer detalles.
- **No incluye**: clasificación de leads, atribución por referral, envío saliente,
  Messenger/Instagram activos ni bot-gateway (changes 3, 5, 7 y 8 de la secuencia).

## Capabilities

### New Capabilities

- `channel-webhooks`: endpoints públicos de webhook (Meta y Telegram) con verificación de
  autenticidad y política de ACK.
- `channel-adapter`: contrato común de normalización de eventos de canal a mensaje
  entrante único.
- `message-ingestion`: persistencia idempotente de mensajes entrantes con dedup de
  personas, identidades de canal, conversaciones y eventos de dominio.

### Modified Capabilities

- `backend-foundation`: el esquema zod de entorno incorpora las variables opcionales de
  canales (sin romper el arranque cuando no están configuradas).

## Impact

- Código nuevo: módulo `channels` en `server/src/channels/` (controladores, adaptadores,
  servicio de ingestión, guards de firma).
- `main.ts`: se habilita `rawBody` (necesario para verificar la firma HMAC de Meta).
- `.env.example`: variables nuevas de canales.
- Sin cambios de esquema de base de datos (usa las tablas del change anterior).
- Para producción se necesitará una URL HTTPS pública (decisión de despliegue aún abierta);
  el desarrollo local puede usar túneles, fuera del alcance de este change.
