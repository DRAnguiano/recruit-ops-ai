# media-download

## ADDED Requirements

### Requirement: Background media download
For every persisted media message the system SHALL enqueue a `channels.media` job that
resolves the binary per channel (WhatsApp: Graph API media endpoint with
`WHATSAPP_ACCESS_TOKEN`; Telegram: `getFile` with `TELEGRAM_BOT_TOKEN`), stores it through
the `MediaStorage` abstraction and updates `media.status` to `stored` with the
`storageKey`, emitting `message.media_stored`.

#### Scenario: Successful download
- **WHEN** the media job for a WhatsApp audio completes
- **THEN** the binary exists in storage, the message media has `status=stored` and a
  `storageKey`, and `message.media_stored` was emitted

#### Scenario: Exhausted retries mark failed
- **WHEN** the download keeps failing until BullMQ retries are exhausted
- **THEN** the message media has `status=failed` with the error, and the job remains
  inspectable

### Requirement: Missing token degrades gracefully
Without the channel's token configured, media messages SHALL remain persisted with
`status=pending`; ingestion MUST NOT fail.

#### Scenario: No WhatsApp token
- **WHEN** an audio arrives and `WHATSAPP_ACCESS_TOKEN` is not set
- **THEN** the message row exists with media `status=pending` and no crash occurs

### Requirement: Configurable API bases
Graph and Telegram API base URLs SHALL come from environment (`GRAPH_API_BASE_URL`,
`TELEGRAM_API_BASE_URL`) with official defaults, so tests can run against a local HTTP
server.

#### Scenario: Test server
- **WHEN** the bases point to a local server
- **THEN** downloads work end-to-end without external network
