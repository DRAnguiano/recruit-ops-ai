# channel-webhooks

## Requirements

### Requirement: Meta webhook verification handshake
The system SHALL respond to `GET /webhooks/meta` echoing `hub.challenge` when `hub.mode`
is `subscribe` and `hub.verify_token` matches the configured `META_VERIFY_TOKEN`; any
other combination MUST be rejected with 403.

#### Scenario: Valid verification request
- **WHEN** Meta sends GET with `hub.mode=subscribe` and the correct verify token
- **THEN** the API responds 200 with the raw `hub.challenge` value as body

#### Scenario: Wrong verify token
- **WHEN** the verify token does not match or the channel is not configured
- **THEN** the API responds 403 without revealing configuration details

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

### Requirement: Fast ACK policy
Authenticated webhook requests SHALL be acknowledged with 200 even when the payload
contains no processable messages (statuses, edits, unknown event types) or when it belongs
to a channel not yet processed (Messenger, Instagram); unrecognized content MUST never
produce a 5xx response.

#### Scenario: Status-only payload
- **WHEN** a valid Meta payload contains only delivery statuses
- **THEN** the API responds 200 and no message rows are created

#### Scenario: Messenger event before its change
- **WHEN** a valid Meta payload for `page` (Messenger) arrives
- **THEN** the API responds 200 without processing it
