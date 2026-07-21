# Tasks — add-multi-account-routing

## 1. Schema y credenciales por cuenta

- [x] 1.1 Schema: `channel_credentials.account_external_id` (nullable) +
      `conversations.channel_account` (nullable); índices únicos parciales
      `(kind, account_external_id) WHERE active` para cuentas y `meta_app` singleton;
      migración drizzle + backfill del `account_external_id` de las credenciales existentes
      desde sus secretos (phone_number_id / page_id / id del bot del token)
- [x] 1.2 `ChannelCredentialsService`: derivar `account_external_id` de los secretos al
      crear/actualizar (phone_number_id / page_id / id del bot; null para meta_app);
      `resolveByAccount(kind, accountId?)` (por cuenta; sin cuenta → única activa o ausente
      si hay varias), cache por `(kind, account)`; `list` expone `account_external_id`;
      backfill idempotente al arranque de las filas con `account_external_id` NULL

## 2. Extracción de la cuenta destino

- [x] 2.1 `channel-adapter.ts`: campo `destinationAccount?` en `NormalizedInboundMessage`
- [x] 2.2 `WhatsAppAdapter`: extraer `value.metadata.phone_number_id`;
      `meta-messaging.adapter.ts`: extraer `entry[].id` (page id) como `destinationAccount`
- [x] 2.3 Ingestión: al crear/continuar la conversación, persistir
      `conversations.channel_account` con el `destinationAccount` del mensaje

## 3. Webhooks y ruteo saliente

- [x] 3.1 Telegram multi-bot: `POST /webhooks/telegram/:accountId`; `TelegramSecretGuard`
      resuelve el `telegram` de ese `accountId` y verifica su `webhook_secret`; el controller
      inyecta `accountId` como `destinationAccount`; retirar el path viejo
- [x] 3.2 `channel-senders.ts` y `media-downloaders.ts`: resolver por la cuenta de la
      conversación/mensaje (`resolveByAccount`), con fallback a la única activa; envío
      ambiguo (varias activas, sin cuenta) → `CHANNEL_NOT_CONFIGURED`

## 4. Tests y cierre

- [x] 4.1 Tests e2e: dos cuentas de WhatsApp activas; entrante a cada número crea/continúa
      su conversación con el `channel_account` correcto; respuesta sale por la credencial de
      esa cuenta; Telegram por path por bot; page id de Meta como cuenta
- [x] 4.2 Tests: CRUD con `account_external_id` (dos cuentas coexisten, misma cuenta activa
      dos veces → 409, `meta_app` singleton); fallback de conversación sin cuenta (una activa
      envía; varias → `CHANNEL_NOT_CONFIGURED`); DELETE referenciado → 409
- [x] 4.3 `server/README.md` (varias cuentas por canal + path por bot de Telegram +
      re-`setWebhook`) + project.md §10 (marcar 10c-2) + suite completa + lint +
      verificación manual (alta de 2 cuentas → entrante/saliente por la correcta)
