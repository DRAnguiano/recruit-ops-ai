# add-outbound-messaging — Proposal

## Why

El inbox ya muestra conversaciones en vivo (add-api-for-spa), pero es de solo lectura:
las reclutadoras siguen respondiendo desde el teléfono. La promesa central del producto —
"las reclutadoras responden desde el CRM, no desde el teléfono" (project.md §3.2) — exige
envío saliente. Además, hoy los webhooks de estado de WhatsApp (`statuses`) se ACKean y se
descartan: no sabemos si un mensaje llegó, se leyó o falló.

## What Changes

- **Envío desde el inbox**: `POST /api/conversations/:id/messages` envía texto libre por el
  canal de la conversación (WhatsApp Cloud API y Telegram; Messenger/IG llegan con el
  change 9). El mensaje saliente se persiste primero (`delivery.status='queued'`) y un
  worker BullMQ (`channels.outbound`) lo entrega con reintentos.
- **Ventana de 24 h como política del backend** (restricción §4: capacidades del canal las
  impone el sistema, no la disciplina del usuario): en WhatsApp, si el último mensaje
  entrante de la conversación tiene más de 24 h, el texto libre se rechaza con error tipado
  y solo se permite enviar una **plantilla aprobada**. Telegram no tiene ventana.
- **Catálogo de plantillas** (`message_templates`): nombre, idioma, cuerpo con variables
  `{{n}}`, canal y estado de aprobación — datos configurables por API/UI, nunca hardcodeados.
  Enviar plantilla = nombre + variables; el backend construye el payload de la Cloud API.
- **Estado de entrega**: los webhooks `statuses` de WhatsApp actualizan
  `messages.delivery` (`queued → sent → delivered → read`, o `failed` con el error de Meta)
  y emiten `message.delivery_updated`; el inbox lo ve en vivo por el WS existente.
- **El bot no envía nada en este change**: el envío del bot externo llega con
  `add-bot-gateway` (change 8) reutilizando este mismo pipeline validado.

## Capabilities

### New

- `outbound-messaging`: envío saliente persistido y encolado por canal (senders de
  WhatsApp/Telegram tras interfaz común, reintentos, idempotencia).
- `whatsapp-window-policy`: motor determinista de la ventana de 24 h + envío de plantillas.
- `message-templates`: catálogo CRUD de plantillas aprobadas.
- `delivery-status`: procesamiento de webhooks de estado y `messages.delivery`.

### Modified

- `channel-webhooks`: el payload `statuses` de Meta deja de descartarse (se procesa).
- `inbox-api`: la conversación expone `canSendFreeform`/`windowExpiresAt` para que la UI
  sepa qué ofrecer.

## Impact

- **Schema**: columnas nuevas en `messages` (`delivery` JSONB) + tabla `message_templates`
  (+ migración). Aditivo, sin breaking.
- **Env**: `WHATSAPP_PHONE_NUMBER_ID` (opcional; sin él, el envío WhatsApp responde error
  tipado de canal no configurado).
- **Código**: módulo `channels` (senders + worker + statuses), `conversations` (endpoint de
  envío), `catalog` (CRUD de plantillas). Sin cambios en la SPA (llega con su migración).
- **No simulado**: los tests usan servidores HTTP falsos locales (patrón de media), la
  verificación manual usa la Graph API real solo si hay token configurado.
