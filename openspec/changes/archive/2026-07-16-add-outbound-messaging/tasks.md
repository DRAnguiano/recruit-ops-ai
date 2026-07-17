# Tasks — add-outbound-messaging

## 1. Schema y base

- [x] 1.1 Migración: tabla `message_templates` + doc de `messages.delivery` JSONB (tipo
      `MessageDelivery` en schema.ts); env `WHATSAPP_PHONE_NUMBER_ID` (zod + `.env.example`)
- [x] 1.2 Motor puro `whatsapp-window.ts` (`getWindowState(lastInboundAt, now)`) con tests
      unitarios (dentro, fuera, sin inbound, borde exacto de 24 h)

## 2. Pipeline de envío

- [x] 2.1 Interfaz `ChannelSender` + `WhatsAppSender` (texto y template payload) y
      `TelegramSender` (`sendMessage`), bases de API por env; errores tipados
      `CHANNEL_NOT_CONFIGURED` / `CHANNEL_NOT_SUPPORTED`
- [x] 2.2 `OutboundService`: validar (conversación abierta, canal, ventana/plantilla),
      persistir `direction='outbound'` + `delivery={status:'queued'}` + evento
      `message.sent`, actualizar `lastMessageAt`, encolar `channels.outbound` (jobId=messageId)
- [x] 2.3 Worker `channels.outbound` en `ChannelQueuesService`: enviar, `delivery→sent`
      con external id (también `external_message_id`), agotados los reintentos →
      `delivery→failed` + `message.delivery_updated`
- [x] 2.4 `POST /api/conversations/:id/messages` (zod: body XOR templateId+variables) +
      `canSendFreeform`/`windowExpiresAt` en el detalle de conversación

## 3. Plantillas

- [x] 3.1 CRUD `/api/message-templates` en el módulo catalog (patrón genérico) + render de
      variables `{{n}}` con validación de conteo

## 4. Estados de entrega

- [x] 4.1 `WhatsAppAdapter.parseStatuses()` + encolado de status en el webhook (dejan de
      descartarse); aplicación idempotente por `channel + external_message_id` con avance
      monotónico de estados y evento `message.delivery_updated`

## 5. Tests y cierre

- [x] 5.1 Tests e2e de envío: texto en ventana (fake Cloud API), plantilla fuera de
      ventana, `WINDOW_EXPIRED`, `CHANNEL_NOT_CONFIGURED`, conversación cerrada, Telegram
- [x] 5.2 Tests e2e de delivery: webhook `statuses` → `sent→delivered→read` en vivo por
      WS; `failed` con error; status desconocido ignorado; no-regresión de estados
- [x] 5.3 README (`server/`): sección de envío saliente, ventana 24 h, plantillas y env
      nueva; suite completa + lint + verificación manual (enviar → fake API → status
      webhook → estado visible por REST y WS)
