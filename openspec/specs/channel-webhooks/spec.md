# channel-webhooks

## Requirements

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
`POST /webhooks/telegram/:accountId` SHALL require the `X-Telegram-Bot-Api-Secret-Token`
header to match the `webhook_secret` of the active `telegram` credential whose
`account_external_id` equals `:accountId`, resolved from the encrypted store; mismatches or
the absence of that credential MUST be rejected with 403. The `:accountId` is threaded to
the parsed messages as their destination account so replies go through the same bot. Each
bot registers `setWebhook` to its own path.

#### Scenario: Valid secret token on the bot's path
- **WHEN** Telegram sends an update to `/webhooks/telegram/:accountId` with the correct
  secret header for that bot's credential
- **THEN** the parsed messages are enqueued on `channels.inbound` tagged with that account
  and the API responds 200

#### Scenario: Secret of a different bot rejected
- **WHEN** the secret header matches a different bot's credential than `:accountId`
- **THEN** the API responds 403 and nothing is enqueued nor persisted

#### Scenario: Unknown account path rejected
- **WHEN** `:accountId` has no active `telegram` credential
- **THEN** the API responds 403

### Requirement: Fast ACK policy
Authenticated webhook requests SHALL be acknowledged with 200 even when the payload
contains no processable messages (edits, reactions, unknown event types) or when it
belongs to a channel not yet processed (Messenger, Instagram); unrecognized content MUST
never produce a 5xx response. WhatsApp `statuses` entries are no longer discarded: they
are enqueued as delivery updates (see delivery-status) while still being ACKed with 200.

#### Scenario: Status-only payload
- **WHEN** a valid Meta payload contains only delivery statuses
- **THEN** the API responds 200, no message rows are created, and a delivery-update job is
  enqueued

#### Scenario: Messenger event before its change
- **WHEN** a valid Meta payload for `page` (Messenger) arrives
- **THEN** the API responds 200 without processing it
