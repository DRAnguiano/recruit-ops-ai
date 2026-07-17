## Why

Hoy cada canal se configura con variables de entorno globales
(`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_PAGE_ID`/
`META_PAGE_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`,
`META_APP_SECRET`/`META_VERIFY_TOKEN`): los secretos viven en texto plano en el entorno
del proceso y no hay forma de administrarlos sin redeploy. Este change (10c de
`project.md` §10) mueve las credenciales de canal a una **tabla cifrada en la DB** con
llave maestra en env, y una API para administrarlas — el prerequisito para operar varias
líneas/páginas, que el ruteo multi-cuenta añadirá encima en `add-multi-account-routing`
(10c-2, split acordado con el usuario 2026-07-17).

**Alcance de este change**: sacar los secretos de env a un almacén cifrado con CRUD y
resolución cacheada, conservando **una cuenta activa por canal** (mismo comportamiento
observable de hoy). El soporte de múltiples cuentas por canal y el ruteo del entrante a la
cuenta que lo recibió van en el change siguiente.

## What Changes

- **Tabla `channel_credentials`** con los secretos cifrados en reposo (AES-256-GCM, IV
  por valor, tag autenticado) usando una **llave maestra** de env
  (`CHANNEL_CREDENTIALS_KEY`, 32 bytes en base64). Modela dos niveles de credencial:
  - **App de Meta** (`kind='meta_app'`, compartido por WhatsApp/Messenger/Instagram del
    mismo app): `app_secret` (verificación HMAC del webhook) y `verify_token` (handshake).
  - **Cuenta de canal** (`kind='whatsapp'|'meta_page'|'telegram'`): WhatsApp
    (`phone_number_id` + `access_token`), página de Meta (`page_id` + `page_access_token`,
    sirve Messenger e Instagram), bot de Telegram (`bot_token` + `webhook_secret`). Cada
    fila lleva `kind`, `label`, `active` y los secretos cifrados como blob.
- **Servicio de resolución** con caché (mismo patrón de TTL + invalidación que
  `CatalogValueService`) que descifra bajo demanda y expone la credencial **activa** de
  cada `kind`. Reemplaza TODAS las lecturas de `loadEnv()` de secretos de canal en los
  guards (`meta-signature`, `telegram-secret`), el handshake del webhook, los senders
  (`channel-senders.ts`) y los downloaders de media (`media-downloaders.ts`). Sin
  credencial activa → el canal se comporta como "no configurado" (403 en webhook,
  `CHANNEL_NOT_CONFIGURED` al enviar, media `pending`), nunca crash.
- **CRUD `/api/channel-credentials`**: listar (solo metadatos: `kind`, `label`, `active`,
  timestamps y una **máscara** de cada secreto — nunca el valor), crear, editar (rota
  secretos y/o `active`), borrar. Los secretos entran al escribir y jamás salen en las
  lecturas.
- **Migración desde env**: un seed idempotente en el arranque crea las filas equivalentes
  a las env de canal presentes hoy (si existen y aún no hay fila de ese `kind`), para que
  el sistema desplegado siga funcionando tras migrar. Las env de secretos por canal se
  **retiran** del esquema zod.
- **BREAKING (config de despliegue)**: desaparecen del esquema las env
  `META_APP_SECRET`, `META_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
  `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`; aparece `CHANNEL_CREDENTIALS_KEY` (requerida
  para habilitar cualquier canal). Sin llave, los canales quedan deshabilitados con log.

Fuera de alcance (van en `add-multi-account-routing`, 10c-2): múltiples cuentas por canal,
extracción de la cuenta destino del payload entrante, columna de cuenta en
`conversations`, paths de Telegram por id. También fuera: UI de administración (change
posterior), rotación de la llave maestra, y las credenciales de la Marketing API
(`META_ADS_*`, que no son un canal de mensajería y siguen en env).

## Capabilities

### New Capabilities

- `channel-credentials`: almacén cifrado de credenciales de canal (llave maestra en env,
  AES-256-GCM), servicio de resolución con caché de la credencial activa por tipo, y CRUD
  que acepta secretos al escribir pero nunca los devuelve.

### Modified Capabilities

- `channel-webhooks`: la verificación de firma HMAC y el handshake `verify_token`
  resuelven el app secret / verify token de Meta desde el almacén (no de env); Telegram
  verifica su `webhook_secret` desde el almacén. Sin credencial → 403 como hoy.
- `outbound-messaging`: los senders de WhatsApp y Telegram resuelven el token/ids desde el
  almacén en vez de env; sin credencial activa → `CHANNEL_NOT_CONFIGURED`.
- `meta-messaging-channels`: el envío por Messenger/Instagram resuelve la credencial de la
  página desde el almacén.
- `backend-foundation`: nueva env `CHANNEL_CREDENTIALS_KEY` (llave maestra); se retiran
  del esquema zod las env de secretos por canal (**BREAKING** de configuración).

## Impact

- **Schema**: tabla nueva `channel_credentials` + migración. Sin cambios en otras tablas
  (el ruteo por cuenta llega en 10c-2).
- **Código**: `channels/credentials/` (servicio de cifrado con `node:crypto`, servicio de
  resolución, controller CRUD, seed desde env), guards `meta-signature`/`telegram-secret`
  y el handshake en `webhooks.controller`, `channel-senders.ts` y `media-downloaders.ts`
  (resolución desde el almacén), `env.ts`/`.env.example`.
- **Dependencias**: ninguna nueva — `node:crypto` (AES-256-GCM) cubre el cifrado.
- **Sin cambios en la SPA**.
- **Docs**: `server/README.md` — generación de `CHANNEL_CREDENTIALS_KEY` y flujo de alta
  de credenciales por API.
- **Secuencia**: al archivar, `project.md` §10 marca 10c hecho y añade
  `add-multi-account-routing` como 10c-2.
