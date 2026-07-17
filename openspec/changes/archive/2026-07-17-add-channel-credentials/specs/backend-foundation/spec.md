# backend-foundation (delta)

## ADDED Requirements

### Requirement: Channel credentials master key
The environment schema SHALL accept an optional `CHANNEL_CREDENTIALS_KEY` — a base64
string decoding to exactly 32 bytes — used as the AES-256-GCM master key for the encrypted
channel credential store. Its absence MUST NOT prevent startup; it only disables all
channels (webhooks respond 403, sends respond `CHANNEL_NOT_CONFIGURED`, media stays
`pending`).

#### Scenario: Startup without master key
- **WHEN** the backend starts without `CHANNEL_CREDENTIALS_KEY`
- **THEN** it boots normally and every channel behaves as not configured

#### Scenario: Invalid key rejected
- **WHEN** `CHANNEL_CREDENTIALS_KEY` is present but does not decode to 32 bytes
- **THEN** validation fails at startup with a readable message

#### Scenario: Variable documented
- **WHEN** `CHANNEL_CREDENTIALS_KEY` is added to the zod schema
- **THEN** it appears in `.env.example` with an explanatory comment and a generation hint

## REMOVED Requirements

### Requirement: Optional channel configuration variables
**Reason**: Channel secrets (`META_APP_SECRET`, `META_VERIFY_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`) move out of the environment into the encrypted
`channel_credentials` store; they are no longer part of the validated env schema.
**Migration**: Set `CHANNEL_CREDENTIALS_KEY` and let the first-boot seed import the legacy
values from the process environment, then remove those env lines; thereafter manage them
via `POST/PATCH /api/channel-credentials`.

## MODIFIED Requirements

### Requirement: Media and API-base configuration variables
The environment schema SHALL accept optional `MEDIA_STORAGE_DIR` (default
`./storage/media`), plus `GRAPH_API_BASE_URL` and `TELEGRAM_API_BASE_URL` with the
official defaults. Channel download tokens (`WHATSAPP_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`)
are no longer environment variables — they are resolved from the encrypted credential
store. The absence of these variables MUST NOT prevent startup.

#### Scenario: Startup without media configuration
- **WHEN** the backend starts without media variables
- **THEN** it boots normally using the default storage dir and official API base URLs, and
  media downloads remain `pending` until a channel credential resolves

#### Scenario: Variables documented
- **WHEN** the media/API-base variables are in the zod schema
- **THEN** they appear in `.env.example` with explanatory comments
