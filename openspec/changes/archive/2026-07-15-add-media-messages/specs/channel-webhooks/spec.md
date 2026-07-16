# channel-webhooks (delta)

## MODIFIED Requirements

### Requirement: Meta payload signature validation
`POST /webhooks/meta` SHALL validate `X-Hub-Signature-256` as HMAC-SHA256 of the exact raw
request body using `META_APP_SECRET`, with a constant-time comparison. Unsigned or
invalidly signed payloads MUST be rejected with 403 and MUST NOT be processed.

#### Scenario: Valid signature
- **WHEN** a POST arrives whose signature matches the raw body
- **THEN** the parsed messages are enqueued on `channels.inbound` and the API responds 200

#### Scenario: Invalid signature
- **WHEN** the signature header is missing or does not match
- **THEN** the API responds 403 and nothing is enqueued nor persisted

### Requirement: Telegram webhook authentication
`POST /webhooks/telegram` SHALL require the `X-Telegram-Bot-Api-Secret-Token` header to
match the configured `TELEGRAM_WEBHOOK_SECRET`; mismatches MUST be rejected with 403.

#### Scenario: Valid secret token
- **WHEN** Telegram sends an update with the correct secret header
- **THEN** the parsed messages are enqueued on `channels.inbound` and the API responds 200

#### Scenario: Missing secret token
- **WHEN** the header is missing or wrong
- **THEN** the API responds 403 and nothing is enqueued nor persisted
