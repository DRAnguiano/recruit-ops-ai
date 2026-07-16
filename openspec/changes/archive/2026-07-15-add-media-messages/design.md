# Design — add-media-messages

## Context

La ingestión síncrona era correcta mientras el trabajo por mensaje fueran writes locales
(design de add-channel-webhooks, decisión 1, con su disparador de cambio explícito).
Descargar audios de la Graph API introduce I/O de red: llegó el momento de encolar. A la
vez, los adaptadores hoy devuelven `[]` para mensajes no-texto — audios reales de
candidatos se pierden (solo queda el ACK).

## Goals / Non-Goals

**Goals:**
- Ningún mensaje de candidato se pierde, sea texto, audio, imagen, documento o video.
- El webhook ACKea tras autenticar+encolar; Postgres caído ya no pierde mensajes.
- Media descargada y almacenada en background con estados y reintentos observables.
- El bot-gateway (change 8) podrá entregar al LLM la referencia del binario almacenado.

**Non-Goals:**
- Media saliente; transcripción/OCR (responsabilidad del LLM externo); S3 real;
  límites de tamaño sofisticados (cap simple de 25 MB); stickers/reacciones/ubicación
  (siguen ACKeados sin persistir, documentado).

## Decisions

1. **`NormalizedInboundMessage.kind`**: `text | audio | image | document | video` +
   `media?: { externalId, mimeType?, filename?, caption? }`. El caption va también a
   `body` (es texto útil para clasificación). Los adaptadores siguen puros: extraen la
   referencia, nunca descargan.
2. **`messages.type` y `messages.media` JSONB** (no tabla aparte): la media es 1:1 con el
   mensaje y sus estados viven juntos (`{ externalId, mimeType, filename, status:
   pending|stored|failed, storageKey?, sizeBytes?, error? }`). Tabla aparte cuando exista
   más de un adjunto por mensaje (no es el caso en WhatsApp/Telegram entrantes).
3. **Cola `channels.inbound` con payload = mensaje normalizado** (serializado; `sentAt`
   ISO). JobId = `<canal>__<id externo>` (BullMQ prohíbe `:` en jobIds) → BullMQ deduplica reintentos del proveedor
   ya en la cola; la unique de Postgres sigue siendo la garantía final. El worker llama la
   MISMA `MessageIngestionService.ingest` (sin cambios de semántica).
4. **Cola `channels.media` encadenada**: al persistir un mensaje con media se encola su
   descarga (jobId = messageId). Reintentos con backoff exponencial (5 intentos); al
   agotar, `status=failed` con el error — visible y re-encolable.
5. **`MediaDownloader` por canal**: WhatsApp = `GET {GRAPH_API_BASE_URL}/{mediaId}` (JSON
   con `url`) → `GET url` con `Authorization: Bearer`; Telegram = `getFile` → descarga de
   `/file/bot<token>/<file_path>`. Bases de API por env con defaults oficiales → tests con
   servidor HTTP local, sin mocks de librería.
6. **`MediaStorage` como interfaz** con implementación filesystem (`MEDIA_STORAGE_DIR`,
   default `./storage/media`, key = `channel/messageId/filename`). S3/MinIO será otra
   implementación cuando se decida despliegue (open question del change 2). El dominio
   solo conoce `storageKey`.
7. **Webhook responde tras encolar**: la verificación de firma no cambia; el controlador
   pierde la dependencia de ingestión directa. Redis caído → 500 del webhook → Meta
   reintenta (correcto: es la única pieza que DEBE estar viva).
8. **Sin token configurado** la descarga marca `pending` y no falla la ingestión: el canal
   puede operar solo-texto (Telegram sin `TELEGRAM_BOT_TOKEN`, por ejemplo).

## Risks / Trade-offs

- [Redis se vuelve punto único del webhook] → ya lo era para BullMQ; docker-compose local
  y el despliegue deberán tratar Redis como crítico. El ACK 500 con Redis caído es
  comportamiento correcto (Meta reintenta con backoff).
- [URLs de media de WhatsApp expiran (~5 min)] → la descarga resuelve la URL en el mismo
  job (nunca se persiste la URL, solo el media id, que permite re-resolver).
- [Filesystem local no escala horizontalmente] → aceptado hasta la decisión de despliegue;
  la interfaz aísla el cambio a una clase.
- [Payloads grandes en Redis] → solo va el mensaje normalizado (texto + referencia), nunca
  el binario.

## Migration Plan

Aditivo (columnas nuevas con default). El cambio webhook→cola es interno; el contrato
HTTP externo no cambia. Rollback = volver a llamar ingestión en línea (una línea en el
controlador). Mensajes ya persistidos no se ven afectados.

## Open Questions

- Backend de almacenamiento definitivo (S3/MinIO vs disco del VPS) — sigue atado a la
  decisión de despliegue.
