# Tasks — add-media-messages

## 1. Esquema y configuración

- [x] 1.1 Migración: `messages.type` (default `text`) y `messages.media` JSONB
- [x] 1.2 Env: `WHATSAPP_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, `MEDIA_STORAGE_DIR`, `GRAPH_API_BASE_URL`, `TELEGRAM_API_BASE_URL` (opcionales/defaults) + `.env.example`

## 2. Adaptadores con media

- [x] 2.1 `NormalizedInboundMessage.kind` + `media` (externalId/mime/filename/caption); caption → `body`
- [x] 2.2 WhatsApp: audio/voice/image/document/video con media id; stickers/reactions/location → []
- [x] 2.3 Telegram: voice/audio/photo (mayor resolución)/document/video con file_id
- [x] 2.4 Tests de adaptadores con payloads de media reales

## 3. Ingestión encolada

- [x] 3.1 Cola `channels.inbound` (jobId `<canal>__<id externo>`); worker que deserializa y llama la ingestión existente
- [x] 3.2 Webhook: encolar tras autenticar/parsear (sin ingestión en línea); registrar worker en el módulo
- [x] 3.3 Persistir `type`/`media` en la ingestión y encolar `channels.media` por mensaje con media
- [x] 3.4 Tests: webhook→cola→worker produce el mismo resultado; dedup por jobId; reintento del proveedor sin duplicados

## 4. Descarga de media

- [x] 4.1 `MediaStorage` (interfaz) + implementación filesystem (`MEDIA_STORAGE_DIR`, key `channel/messageId/filename`)
- [x] 4.2 Downloaders WhatsApp (Graph API, URL efímera resuelta en el job) y Telegram (`getFile`), bases por env
- [x] 4.3 Worker `channels.media`: descarga → storage → `media.status=stored` + `message.media_stored`; backoff 5 intentos → `failed` con error; sin token → `pending`
- [x] 4.4 Tests con servidor HTTP local: descarga exitosa, fallo agotado marca `failed`, sin token queda `pending`

## 5. Cierre

- [x] 5.1 Actualizar README de `server/` (colas, media, env nuevas)
- [x] 5.2 Verificación completa: lint + suite + prueba manual (webhook con audio → job → binario en storage y fila `stored`)
