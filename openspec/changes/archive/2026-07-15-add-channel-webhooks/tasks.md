# Tasks — add-channel-webhooks

## 1. Configuración y base

- [x] 1.1 Ampliar `env.ts` con `META_APP_SECRET`, `META_VERIFY_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (opcionales) y documentarlas en `.env.example`
- [x] 1.2 Habilitar `rawBody: true` en `main.ts` para verificación HMAC del cuerpo crudo

## 2. Adaptadores de canal

- [x] 2.1 Definir `ChannelAdapter` y `NormalizedInboundMessage` (contrato puro, sin I/O)
- [x] 2.2 Adaptador WhatsApp Cloud API: mensajes de texto, teléfono E.164 desde `wa_id`, tolerante a statuses/tipos no soportados
- [x] 2.3 Adaptador Telegram: updates `message`, id externo `chatId_messageId`, tolerante a updates sin mensaje
- [x] 2.4 Tests unitarios de ambos adaptadores con payloads reales de ejemplo (texto, status-only, update no-mensaje)

## 3. Webhooks

- [x] 3.1 `MetaSignatureGuard` (HMAC-SHA256 timing-safe sobre raw body) y `TelegramSecretGuard`; canal sin configurar → 403
- [x] 3.2 Controlador `GET /webhooks/meta` (handshake `hub.challenge`) y `POST /webhooks/meta` (solo procesa WhatsApp; page/instagram se ACKean)
- [x] 3.3 Controlador `POST /webhooks/telegram`
- [x] 3.4 Tests de webhooks: challenge ok/403, firma válida/ inválida, secret de Telegram, ACK 200 con payload no procesable

## 4. Ingestión

- [x] 4.1 `MessageIngestionService`: resolución persona (identidad → teléfono → crear), identidad de canal, conversación abierta, insert idempotente del mensaje en transacción
- [x] 4.2 Emisión de eventos `person.created` / `conversation.started` / `message.received` solo por hechos ocurridos
- [x] 4.3 Tests de ingestión: duplicado sin efecto, identidad conocida reutilizada, teléfono existente vincula canal nuevo, continuidad de conversación, set de eventos correcto

## 5. Cierre

- [x] 5.1 Registrar `ChannelsModule` en `AppModule`, actualizar README de `server/` con las rutas y variables nuevas
- [x] 5.2 Verificación completa: lint + suite entera + prueba manual de los 3 endpoints con curl (firma real calculada)
