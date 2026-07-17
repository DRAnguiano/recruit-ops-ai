# Tasks — add-channel-credentials

## 1. Cifrado y schema

- [x] 1.1 Env `CHANNEL_CREDENTIALS_KEY` (zod: base64 → 32 bytes exactos; opcional) +
      `.env.example` con hint `openssl rand -base64 32`; retirar del esquema zod las env
      de secretos por canal (`META_APP_SECRET`, `META_VERIFY_TOKEN`,
      `TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
      `TELEGRAM_BOT_TOKEN`, `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`)
- [x] 1.2 Tabla `channel_credentials` (kind/label/active/secrets_encrypted + timestamps)
      en schema.ts con índice único parcial `(kind) WHERE active`; migración drizzle
- [x] 1.3 `CredentialCipher` (node:crypto AES-256-GCM): `encrypt(obj)`/`decrypt(blob)`
      con IV aleatorio + authTag, base64 `iv||tag||ciphertext`; tests unitarios
      (round-trip, llave incorrecta → error, tamaño de llave inválido)

## 2. Resolución y consumidores

- [x] 2.1 `ChannelCredentialsService`: `resolve(kind)` con caché TTL 60 s + invalidación;
      getters tipados `metaApp()`/`whatsapp()`/`metaPage()`/`telegram()`; sin llave o sin
      fila activa → ausente (nunca throw); descifrado fallido → ausente + log
- [x] 2.2 Guards `MetaSignatureGuard`/`TelegramSecretGuard` async: resuelven
      `meta_app.app_secret` / `telegram.webhook_secret` del almacén; handshake
      `GET /webhooks/meta` compara `meta_app.verify_token`; sin credencial → 403
- [x] 2.3 `channel-senders.ts`: WhatsApp/Telegram/Meta-page resuelven token/ids del
      almacén (await); sin credencial activa → `CHANNEL_NOT_CONFIGURED`
- [x] 2.4 `media-downloaders.ts`: WhatsApp/Telegram resuelven token del almacén; sin
      credencial → media queda `pending` sin crash

## 3. API y migración

- [x] 3.1 CRUD `/api/channel-credentials` (controller + service): list/detail solo
      metadatos + `configured`; create/update con zod discriminado por `kind` que cifra
      los secretos; update sin secretos toca solo label/active; DELETE referenciado → 409;
      eventos `actor='user'` sin secreto
- [x] 3.2 Seed idempotente al arranque: si hay llave y no existe fila de un `kind`, crear
      la credencial desde las env legacy leídas directo de `process.env`; nunca pisar filas
- [x] 3.3 `ChannelCredentialsModule` (cipher + service + controller + seed) exportando el
      servicio; cablear en `app.module.ts`; guards y `channels`/`campaigns` que dependan
      del servicio lo importan

## 4. Tests y cierre

- [x] 4.1 Tests e2e con credenciales en DB: webhook Meta firma válida/ inválida y
      handshake contra el almacén; Telegram secret; sin credencial → 403; envío WhatsApp/
      Telegram/Messenger resuelto del almacén; `CHANNEL_NOT_CONFIGURED` sin credencial
- [x] 4.2 Tests del CRUD: create cifra y no devuelve secreto; list oculta secretos; update
      rota; `single active per kind`; seed idempotente desde env; media por credencial
- [x] 4.3 `server/README.md` (generación de la llave + alta por API + migración desde env)
      + project.md §10 (marcar 10c, añadir `add-multi-account-routing` como 10c-2) + suite
      completa + lint + verificación manual (alta por API → webhook/envío reales de humo)
