# Design — add-channel-webhooks

## Context

El backend de `add-backend-foundation` ya tiene el esquema multicanal (`people`,
`channel_identities`, `conversations`, `messages` con unique `channel +
external_message_id`) y el event log. Falta la puerta de entrada: los webhooks. Meta envía
WhatsApp/Messenger/Instagram a un mismo endpoint por app, con firma HMAC del cuerpo crudo;
Telegram envía updates a un endpoint propio con un secret token en header.

## Goals / Non-Goals

**Goals:**
- Webhooks verificables criptográficamente (nunca procesar payloads sin autenticar).
- Un solo modelo de mensaje entrante normalizado, venga de donde venga.
- Ingestión idempotente: reintentos de Meta/Telegram no duplican mensajes.
- ACK 200 inmediato tras autenticar; los proveedores reintentan/desactivan webhooks lentos.

**Non-Goals:**
- Clasificación/atribución de leads (change 3), envío saliente (change 5), media/adjuntos
  (se registra el mensaje con su `raw_payload`; la descarga de media llega con el pipeline
  de leads), Messenger/IG (change 8), reintentos vía BullMQ.

## Decisions

1. **Procesamiento síncrono en el request** (sin cola BullMQ todavía): la ingestión son
   2-4 writes a Postgres; muy por debajo del timeout de Meta. Cuando el pipeline de leads
   agregue trabajo pesado (change 3), la ingestión encolará. Alternativa rechazada por
   ahora: encolar el payload crudo — añade una pieza móvil sin necesidad actual.
2. **`rawBody: true` en NestFactory** + `RawBodyRequest<Request>`: la firma
   `X-Hub-Signature-256` es HMAC-SHA256 del cuerpo crudo exacto; cualquier re-serialización
   JSON rompe la verificación. Comparación con `crypto.timingSafeEqual`.
3. **Guards de Nest por proveedor** (`MetaSignatureGuard`, `TelegramSecretGuard`): la
   autenticidad se decide antes de entrar al controlador. Canal no configurado (sin secret
   en env) → 403 genérico, sin filtrar información.
4. **`ChannelAdapter` como interfaz de normalización pura** (sin I/O):
   `parse(raw) → NormalizedInboundMessage[]` con `{ channel, externalMessageId,
   externalUserId, senderName?, phoneE164?, body?, sentAt, raw }`. Un payload de webhook
   puede traer 0..N mensajes (Meta agrupa `entry[]/changes[]`; statuses y edits producen 0).
   Adaptadores puros = testeables sin red ni DB.
5. **Normalización de teléfono a E.164**: WhatsApp da `wa_id` (dígitos con país, sin `+`) →
   se guarda `+<wa_id>`. Telegram normalmente no da teléfono → persona sin `phone` hasta
   que el flujo lo capture; la identidad de canal es la llave. El merge posterior de una
   persona-telegram con una persona-teléfono es problema del change 3 (dedup/merge).
6. **Orden de ingestión** (en transacción): identidad de canal → persona (buscar por
   identidad; si no, por teléfono; si no, crear) → conversación abierta persona+canal
   (última sin cerrar o crear) → mensaje con `ON CONFLICT DO NOTHING` sobre el unique.
   Si el mensaje ya existía: no se emite ningún evento (idempotencia total).
7. **Eventos de dominio**: `person.created`, `conversation.started`, `message.received`
   (actor `channel`), con ids como agregados. Son la materia prima de las métricas de
   respuesta del change 3.
8. **Config por env, no por DB, en este change**: los secrets de canal (`META_APP_SECRET`,
   `META_VERIFY_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`) van en env validado por zod como
   opcionales. La meta a futuro (regla "nada hardcodeado") es configurarlos desde UI con
   secretos cifrados; llegará con `add-configurable-catalogs`. Documentado como deuda
   consciente.

## Risks / Trade-offs

- [Payloads de Meta cambian de forma] → el adaptador ignora con log lo que no reconoce y
  el `raw_payload` completo queda en DB para reproceso; nunca 500 por payload extraño
  (Meta desactiva webhooks que fallan repetidamente).
- [Procesamiento síncrono se vuelve lento con volumen] → medible vía eventos; el diseño ya
  contempla mover a cola en el change 3 sin tocar adaptadores.
- [Telegram sin teléfono crea personas "sin phone"] → aceptado; dedup/merge asistido es
  parte del pipeline de leads.
- [Secrets en env] → deuda consciente (decisión 8); rotación requiere redeploy hasta F3.

## Migration Plan

Aditivo: módulo nuevo + 3 rutas nuevas. Sin cambios de esquema. Rollback = quitar el módulo
del `AppModule`. El alta real del webhook en Meta/Telegram (URL pública HTTPS) es operación
de despliegue posterior, no parte del código.

## Open Questions

- URL pública/túnel para pruebas end-to-end con Meta sandbox (depende de la decisión de
  despliegue aún abierta).
