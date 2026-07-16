# add-media-messages

## Why

Los candidatos mandan audios (y fotos de documentos), y el LLM del usuario ya los
entiende — pero hoy los adaptadores ACKean los mensajes no-texto **sin persistirlos**: se
pierden. Además, descargar media introduce I/O de red por mensaje, que es exactamente el
disparador acordado (project.md §3.8) para pasar la ingestión de síncrona a encolada.
Change 4 de la secuencia.

## What Changes

- **Persistencia de media**: los adaptadores dejan de descartar audio/voz/imagen/documento/
  video; el mensaje se persiste con `type`, caption como `body` si existe, y referencia de
  media (id del canal, mime, filename). Nuevas columnas en `messages`: `type` (default
  `text`) y `media` JSONB (id, mime, filename, estado de descarga, storage key).
- **Ingestión encolada (BREAKING interno)**: el webhook ahora solo autentica, parsea y
  encola en `channels.inbound` (BullMQ); un worker ejecuta la misma ingestión idempotente
  + pipeline. El ACK deja de depender de Postgres (una caída de DB ya no pierde mensajes:
  quedan en Redis con reintentos).
- **Descarga de media en background**: cola `channels.media`; el worker resuelve la URL
  (WhatsApp: Graph API `GET /{media-id}` con `WHATSAPP_ACCESS_TOKEN`; Telegram: `getFile`
  con `TELEGRAM_BOT_TOKEN`), descarga el binario y lo guarda vía una abstracción
  `MediaStorage` (implementación inicial: filesystem local `MEDIA_STORAGE_DIR`;
  S3/MinIO cuando se decida el despliegue). Estado `pending → stored | failed` con
  reintentos de BullMQ y evento `message.media_stored`.
- **Bases de API configurables por env** (`GRAPH_API_BASE_URL`, `TELEGRAM_API_BASE_URL`)
  con defaults oficiales — permite tests sin red y futuros proxies.
- Nuevas env vars opcionales: `WHATSAPP_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`,
  `MEDIA_STORAGE_DIR`. Sin token configurado, la media queda `pending` sin romper nada.
- **No incluye**: envío de media saliente, transcripción (la hace el LLM externo vía
  bot-gateway), OCR, antivirus, S3/MinIO real.

## Capabilities

### New Capabilities

- `media-ingestion`: persistencia de mensajes no-texto con tipo y referencia de media.
- `media-download`: descarga en background del binario por canal, almacenamiento vía
  `MediaStorage`, estados y reintentos.
- `queued-ingestion`: webhook → cola BullMQ → worker de ingestión (ACK independiente de
  Postgres, reintentos ante fallos).

### Modified Capabilities

- `channel-adapter`: `parse` produce también mensajes de media (type + referencia), no
  solo texto.
- `channel-webhooks`: el POST autenticado encola en vez de ingerir en línea (la política
  de ACK no cambia).
- `backend-foundation`: env vars nuevas opcionales de tokens/almacenamiento/bases de API.

## Impact

- Código: `channels` (adaptadores, controlador, worker de ingestión, downloader de media,
  storage), migración de `messages`, `env.ts`, `.env.example`, README.
- La cola `channels.inbound` usa la infraestructura BullMQ existente.
- Tests de webhooks existentes cambian: la aserción pasa de "fila creada al responder" a
  "fila creada tras procesar el job".
