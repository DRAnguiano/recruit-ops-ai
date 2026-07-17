# add-outbound-messaging — Design

## Context

El backend ya tiene: mensajes entrantes normalizados e idempotentes, colas BullMQ con
patrón worker (`channels.inbound`, `channels.media`), inbox API con comandos y WS de
eventos. Falta el camino inverso: persistir un mensaje saliente, entregarlo por el canal
correcto, imponer las políticas del canal (ventana 24 h de WhatsApp) y reflejar el estado
de entrega que Meta reporta por webhook.

Restricciones: políticas de canal por diseño (backend las impone), nada de negocio
hardcodeado (plantillas = datos), errores tipados, dominio en inglés.

## Goals / Non-Goals

**Goals:**

- Enviar texto libre y plantillas desde el inbox, por WhatsApp (Cloud API) y Telegram.
- Persistir ANTES de enviar: ningún mensaje saliente existe solo en la memoria del worker.
- Ventana 24 h determinista y testeable como función pura.
- Estados de entrega en vivo (`sent/delivered/read/failed`) desde webhooks `statuses`.

**Non-Goals:**

- Envío del bot externo (→ `add-bot-gateway`, reutiliza este pipeline).
- Messenger/Instagram (→ `add-channels-messenger-instagram`).
- Sync de plantillas con la Graph API (el catálogo se captura manualmente; el sync podrá
  llegar con `add-campaign-sync` o posterior). Media saliente (solo texto/plantilla en F1).
- UI de la SPA.

## Decisions

### 1. Persistir-luego-enviar con cola `channels.outbound`

`POST /api/conversations/:id/messages` valida (ventana, canal configurado, conversación
abierta), inserta el mensaje `direction='outbound'` con `delivery={status:'queued'}` y
encola `channels.outbound` con jobId = messageId (dedup). El worker resuelve el sender del
canal, envía, y actualiza `delivery={status:'sent', externalId}` + `messages.external_message_id`
con el id que devuelve el canal. Fallo tras reintentos → `delivery={status:'failed', error}`
+ evento. Réplica del patrón probado de `channels.media`.

Trade-off: el usuario ve su mensaje como `queued` un instante antes de `sent` — correcto:
es la verdad, y el WS lo actualiza en vivo.

### 2. Interfaz `ChannelSender` por canal, simétrica a `MediaDownloader`

`send(message, conversation, identity): Promise<{ externalMessageId }>`. Implementaciones:
`WhatsAppSender` (POST `{GRAPH_API_BASE_URL}/{WHATSAPP_PHONE_NUMBER_ID}/messages`, texto o
template payload) y `TelegramSender` (`sendMessage` con chat_id de la identidad). Sin token
o sin phone number id → `DomainError CHANNEL_NOT_CONFIGURED` (409) en el momento del POST,
no en el worker: el usuario se entera al instante. Bases de API configurables por env
(patrón de tests con servidor HTTP local ya probado en media).

### 3. Ventana de 24 h: función pura sobre el último mensaje entrante

`whatsapp-window.ts`: `getWindowState(lastInboundAt, now)` → `{ open, expiresAt }`.
La regla oficial de Meta: se puede responder texto libre hasta 24 h después del último
mensaje **entrante** del usuario. Fuente: `conversations` necesita conocer el último
inbound; se calcula con un query sobre `messages` (sin columna nueva; el volumen por
conversación es bajo y el índice por conversación ya existe). Texto libre fuera de ventana
→ `WINDOW_EXPIRED` (409) sugiriendo plantilla. Telegram: siempre `open`.
`GET /api/conversations/:id` expone `canSendFreeform` y `windowExpiresAt`.

### 4. Plantillas como catálogo, payload construido por el backend

`message_templates`: `name`, `language`, `channel`, `body` (texto con `{{1}}…{{n}}` para
previsualización), `variablesCount`, `status` (`approved` default — la captura manual
refleja lo aprobado en Meta), `active`. CRUD en el módulo `catalog` (mismo patrón genérico).
Enviar plantilla = `{ templateId, variables: string[] }`; el backend valida el conteo de
variables, construye el payload `template` de la Cloud API y persiste el `body` renderizado
(las variables sustituidas) para que el historial del inbox sea legible.

### 5. `messages.delivery` JSONB, no columnas sueltas

`{ status: 'queued'|'sent'|'delivered'|'read'|'failed', externalId?, error?, updatedAt }` —
mismo enfoque que `messages.media`. Los estados solo avanzan (read no regresa a delivered;
failed es terminal salvo reintento manual futuro). Mensajes entrantes no llevan `delivery`.

### 6. Webhook `statuses` de WhatsApp actualiza por `external_message_id`

El adapter de WhatsApp gana `parseStatuses()`: cada status (`sent/delivered/read/failed`
con `errors[]` de Meta) se procesa en el mismo worker de inbound (job por webhook, ya
autenticado y encolado). Match por `channel + external_message_id`; status de un mensaje
desconocido se ignora con log (puede ser tráfico previo al CRM). Emite
`message.delivery_updated` → WS en vivo. Idempotente: aplicar el mismo status dos veces
no re-emite evento.

### 7. Quién envía: solo humanos en este change

El endpoint vive en `conversations` (API humana, `actor='user'`). El evento `message.sent`
registra el actor; cuando llegue el bot-gateway, el bot usará el mismo servicio de envío con
`actor='bot'` y validación de catálogo cerrado — sin tocar este pipeline.

## Risks / Trade-offs

- **[Reloj de ventana]** La ventana se calcula con el reloj del servidor vs `sentAt` del
  último inbound (UTC ambos). Deriva de segundos es irrelevante frente a 24 h; Meta es la
  autoridad final y un rechazo del canal se refleja como `failed` con su error.
- **[Plantillas capturadas a mano]** Riesgo de divergencia con lo aprobado en Meta → el
  error de Meta al enviar una plantilla inexistente llega como `failed` visible en el inbox;
  el sync automático queda anotado como mejora futura.
- **[Sin outbound para Messenger/IG]** El endpoint responde `CHANNEL_NOT_SUPPORTED` para
  canales sin sender — explícito y tipado hasta el change 9.

## Migration Plan

Migración aditiva: tabla `message_templates` + nada que alterar en filas existentes
(`delivery` es NULL en lo histórico). Deploy normal, rollback = versión anterior.

## Open Questions

- Ninguna bloqueante. `WHATSAPP_PHONE_NUMBER_ID` se documenta en `.env.example`; el valor
  real llega cuando el usuario conecte el número migrado.
