## Context

`add-channel-credentials` (10c) dejó el almacén cifrado con una credencial **activa por
kind** (índice único parcial `(kind) WHERE active`). El `ChannelCredentialsService`
resuelve "la activa" de cada kind; guards, senders y downloaders la consumen. Los
adaptadores producen `NormalizedInboundMessage` sin registrar a **qué cuenta nuestra**
llegó el mensaje, y las conversaciones no guardan esa cuenta. El payload sí trae el dato:
WhatsApp en `value.metadata.phone_number_id`, Messenger/Instagram en `entry[].id` (page
id). Telegram no lo trae en el update, pero se puede distinguir por el path del webhook
(cada bot registra su propio `setWebhook`).

## Goals / Non-Goals

**Goals:**
- Varias cuentas por canal (varios números de WhatsApp, varias páginas de Meta, varios
  bots de Telegram) coexistiendo.
- El entrante se rutea a la cuenta que lo recibió; el saliente responde por esa cuenta.
- Migración sin romper: conversaciones previas siguen respondiendo mientras haya una sola
  cuenta por canal.

**Non-Goals:**
- Multi-app de Meta (varios `app_secret`): la firma sigue siendo app-level, un `meta_app`.
- UI de administración, rotación de llave, credenciales de Marketing API.
- Reasignar conversaciones históricas a una cuenta (se quedan sin `channel_account`).

## Decisions

### 1. `account_external_id` derivado de los secretos + índice `(kind, account)`
`channel_credentials` gana `account_external_id` (nullable para `meta_app`, que es
app-level). **Se deriva de los secretos al escribir**, no es input del CRUD: WhatsApp del
`phone_number_id`, Meta del `page_id`, Telegram del id del bot (prefijo antes de `:` en el
`bot_token`), `meta_app` → null. Así no hay redundancia ni drift entre el secreto y la
cuenta, y el backfill de las filas de 10c es automático (decifrar + derivar). El índice
único parcial pasa de `(kind) WHERE active` a `(kind, account_external_id) WHERE active AND
kind <> 'meta_app'` para cuentas, más un índice separado que mantiene `meta_app` como
singleton (`(kind) WHERE active AND kind='meta_app'`). Así puede haber N credenciales
`whatsapp` activas (una por número) pero un solo `meta_app`.
- *Alternativa descartada*: tabla aparte de cuentas → normaliza de más; la credencial ya
  ES la cuenta (secretos + identidad juntos).
- *Alternativa descartada*: aceptar `account_external_id` como input del CRUD → redundante
  con el secreto que ya lo contiene y expuesto a inconsistencia.

### 2. La cuenta destino viaja en `NormalizedInboundMessage`
Campo nuevo `destinationAccountId?: string`. Los adaptadores lo llenan:
- WhatsApp: `value.metadata.phone_number_id`.
- Messenger/Instagram: `entry[].id` (page id).
- Telegram: no está en el update → el controller lo inyecta desde el path
  (`/webhooks/telegram/:accountId`) tras verificar la firma de ese bot.
Es opcional: adaptadores viejos o payloads sin metadata dejan `undefined` y la ingestión
cae al fallback.

### 3. La conversación guarda `channel_account`
`conversations.channel_account` (nullable) se setea al crear/continuar la conversación con
el `destinationAccountId` del mensaje. El envío saliente resuelve la credencial por
`(channel, channel_account)`. Se guarda en la conversación (no en cada mensaje) porque el
canal por el que responde una conversación es estable.

### 4. `resolveByAccount(kind, accountId)` con fallback a la única activa
El servicio gana `resolveByAccount(kind, accountId?)`:
- Con `accountId`: resuelve la credencial activa de esa cuenta.
- Sin `accountId` (conversación previa a este change): si hay **exactamente una** credencial
  activa del kind, la usa (compatibilidad); si hay varias, es ambiguo → no configurado.
Mantiene el cache por `(kind, accountId)`; el getter app-level `metaApp()` no cambia.

### 5. Telegram: un path por bot
`POST /webhooks/telegram/:accountId`. El `TelegramSecretGuard` resuelve el `telegram` de
ese `accountId` y verifica su `webhook_secret`; el controller pasa `accountId` como
`destinationAccountId`. El `setWebhook` de cada bot apunta a su path. El path viejo
`/webhooks/telegram` se retira (BREAKING menor de registro; se documenta).
- *Por qué el path y no el payload*: el update de Telegram no identifica al bot receptor;
  el path es la única señal fiable y ya es cómo Telegram separa webhooks por bot.

### 6. Meta sigue con firma app-level; el ruteo es por payload
La firma HMAC de `/webhooks/meta` se valida con el `app_secret` del único `meta_app`
(sin cambio). El ruteo por cuenta ocurre después, al extraer `phone_number_id`/`page_id`
del payload ya verificado. No hace falta multi-app.

## Risks / Trade-offs

- [Conversación previa sin `channel_account` con varias cuentas activas → envío ambiguo]
  → Fallback solo cuando hay UNA activa; con varias, responde `CHANNEL_NOT_CONFIGURED` y se
  documenta que las conversaciones históricas necesitan reasignación manual (fuera de
  alcance) o que se agrega la segunda cuenta después de migrar el histórico.
- [Cambiar el path de Telegram rompe webhooks registrados] → Documentar el re-`setWebhook`
  por bot en el README; es config de despliegue, no datos.
- [`entry[].id` de Instagram vs page id] → En IG conectada a página, `entry.id` es el id de
  la cuenta IG/página; se guarda tal cual como cuenta y la credencial `meta_page` se da de
  alta con ese id.

## Migration Plan

1. Migrar el schema (columnas + índices nuevos). Las credenciales existentes quedan con
   `account_external_id = NULL`; **backfill**: para WhatsApp/Meta/Telegram con una sola
   credencial, setear su `account_external_id` desde sus propios secretos
   (`phone_number_id` / `page_id` / id del bot derivado del `bot_token`).
2. Registrar el webhook de cada bot de Telegram en su nuevo path.
3. Nuevas conversaciones ya guardan `channel_account`; las viejas usan el fallback.
4. Rollback: el código previo ignora las columnas nuevas; el índice `(kind, account)` es
   compatible con una sola cuenta.

## Open Questions

- Ninguna. (El id del bot de Telegram se deriva del `bot_token` — prefijo numérico antes
  de `:` — igual que el resto de `account_external_id` se deriva de los secretos.)
