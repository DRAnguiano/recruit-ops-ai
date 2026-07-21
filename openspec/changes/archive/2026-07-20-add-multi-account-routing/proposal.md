## Why

`add-channel-credentials` (10c) sacó los secretos de canal a un almacén cifrado pero
conserva **una sola cuenta activa por canal**: no se puede operar dos números de WhatsApp
ni dos páginas de Meta (una por empresa/marca), que es justo lo que el negocio necesita.
Este change (10c-2, split acordado con el usuario) añade **múltiples cuentas por canal** y
el **ruteo del mensaje entrante a la cuenta que lo recibió**, para que las respuestas
salgan por la credencial correcta.

## What Changes

- **Cuenta por credencial**: `channel_credentials` gana `account_external_id` (el
  `phone_number_id` de WhatsApp, el `page_id` de Meta, el id del bot de Telegram). Se
  relaja el índice de "una activa por kind" a **una activa por (kind, account)**;
  `meta_app` sigue siendo singleton (es nivel-app, no cuenta).
- **Extracción de la cuenta destino en los adaptadores**: WhatsApp la toma de
  `value.metadata.phone_number_id`; Messenger/Instagram de `entry[].id` (page id);
  Telegram del **path del webhook** (`/webhooks/telegram/:accountId`, un path por bot). El
  mensaje normalizado (`NormalizedInboundMessage`) lleva un campo nuevo con esa cuenta.
- **La conversación recuerda su cuenta**: al crear/continuar una conversación, la
  ingestión guarda la cuenta destino (`conversations.channel_account`), para que el envío
  saliente resuelva la credencial de esa cuenta y no "la activa" genérica.
- **Resolución por cuenta**: el servicio de credenciales gana `resolveByAccount(kind,
  accountId)`; los senders y downloaders resuelven por la cuenta de la conversación/mensaje.
  Sin cuenta (conversaciones previas a este change) hacen fallback a la única credencial
  activa del kind, si hay exactamente una.
- **Webhook de Telegram multi-bot**: `POST /webhooks/telegram/:accountId` verifica el
  `webhook_secret` de esa credencial `telegram`; el `setWebhook` de cada bot apunta a su
  path. El de Meta no cambia de forma (la firma es app-level; el ruteo es por payload).
- **CRUD**: `account_external_id` entra en create/update de `/api/channel-credentials`;
  borrar una credencial referenciada por conversaciones responde 409 (ahora sí hay
  referencia real).

Fuera de alcance: UI de administración (change posterior), rotación de la llave maestra,
y credenciales de Marketing API. La verificación de firma de Meta sigue siendo app-level
(un `meta_app`); multi-app de Meta queda fuera.

## Capabilities

### New Capabilities

- `multi-account-routing`: el mensaje entrante se etiqueta con la cuenta que lo recibió, la
  conversación la recuerda, y el envío saliente responde por la credencial de esa cuenta.

### Modified Capabilities

- `channel-credentials`: las credenciales de cuenta llevan `account_external_id`; se
  admiten varias activas por kind (una por cuenta); resolución por cuenta además de la
  activa única.
- `channel-webhooks`: Telegram se verifica y rutea por path por bot
  (`/webhooks/telegram/:accountId`); el entrante de Meta se etiqueta con la cuenta destino.
- `meta-messaging-channels`: los adaptadores de Messenger/Instagram extraen el `page_id`
  de `entry[].id` como cuenta destino.
- `outbound-messaging`: los senders resuelven la credencial por la cuenta de la
  conversación en vez de la credencial activa genérica del kind.

## Impact

- **Schema**: `channel_credentials.account_external_id` (+ índice `(kind, account)`,
  `meta_app` singleton); `conversations.channel_account`; migración.
- **Código**: adaptadores (WhatsApp/meta-messaging: extraer cuenta), `channel-adapter.ts`
  (campo nuevo en `NormalizedInboundMessage`), ingestión (guardar cuenta en la
  conversación), `webhooks.controller` + `TelegramSecretGuard` (path por bot),
  `ChannelCredentialsService` (`resolveByAccount`), `channel-senders.ts` /
  `media-downloaders.ts` (resolver por cuenta), schemas del CRUD.
- **Dependencias**: ninguna nueva.
- **Sin cambios en la SPA** (el inbox ya filtra por canal; la cuenta es interna).
- **Migración**: conversaciones existentes quedan sin `channel_account`; el envío hace
  fallback a la única credencial activa del kind mientras solo haya una cuenta.
- **Docs**: `server/README.md` — alta de varias cuentas por canal y el path por bot de
  Telegram.
