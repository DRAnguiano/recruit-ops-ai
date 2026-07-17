# channel-webhooks (delta)

## MODIFIED Requirements

### Requirement: Meta webhook verification handshake
The system SHALL respond to `GET /webhooks/meta` echoing `hub.challenge` when `hub.mode`
is `subscribe` and `hub.verify_token` matches the `verify_token` of the active `meta_app`
credential resolved from the encrypted store; any other combination — including no active
credential — MUST be rejected with 403.

#### Scenario: Valid verification request
- **WHEN** Meta sends GET with `hub.mode=subscribe` and the correct verify token
- **THEN** the API responds 200 with the raw `hub.challenge` value as body

#### Scenario: Wrong verify token
- **WHEN** the verify token does not match or no active `meta_app` credential exists
- **THEN** the API responds 403 without revealing configuration details

### Requirement: Meta payload signature validation
`POST /webhooks/meta` SHALL validate `X-Hub-Signature-256` as HMAC-SHA256 of the exact raw
request body using the `app_secret` of the active `meta_app` credential resolved from the
encrypted store, with a constant-time comparison. Unsigned payloads, invalid signatures,
or the absence of an active credential MUST be rejected with 403 and MUST NOT be processed.

#### Scenario: Valid signature
- **WHEN** a POST arrives whose signature matches the raw body
- **THEN** the parsed messages are enqueued on `channels.inbound` and the API responds 200

#### Scenario: Invalid signature
- **WHEN** the signature header is missing or does not match
- **THEN** the API responds 403 and nothing is enqueued nor persisted

### Requirement: Telegram webhook authentication
`POST /webhooks/telegram` SHALL require the `X-Telegram-Bot-Api-Secret-Token` header to
match the `webhook_secret` of the active `telegram` credential resolved from the encrypted
store; mismatches or the absence of an active credential MUST be rejected with 403.

#### Scenario: Valid secret token
- **WHEN** Telegram sends an update with the correct secret header
- **THEN** the parsed messages are enqueued on `channels.inbound` and the API responds 200

#### Scenario: Missing secret token
- **WHEN** the header is missing or wrong
- **THEN** the API responds 403 and nothing is enqueued nor persisted
