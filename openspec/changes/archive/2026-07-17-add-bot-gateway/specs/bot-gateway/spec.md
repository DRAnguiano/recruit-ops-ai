# bot-gateway (delta)

## ADDED Requirements

### Requirement: Signed bot notification for bot-mode conversations
When an inbound message is ingested into a conversation with `attentionMode='bot'` and
the gateway is configured (`BOT_WEBHOOK_URL` + `BOT_SHARED_SECRET`), the system SHALL
enqueue a `bot.notify` job (jobId = message id) that POSTs a v1 contract payload
(conversation with window state, person, lead snapshot, message with `mediaUrl` for
media) to the bot, signed with HMAC-SHA256 of the raw body (`X-Bot-Signature`). Retries
are exponential; exhausted retries are logged and MUST NOT affect ingestion or the inbox.
Human-mode conversations and unconfigured gateways produce no notification.

#### Scenario: Bot-mode message notifies the bot
- **WHEN** an inbound audio message arrives at a bot-mode conversation
- **THEN** the bot receives a signed payload including `message.mediaUrl` and the
  conversation window state

#### Scenario: Human-mode conversation is silent
- **WHEN** an inbound message arrives at a human-mode conversation
- **THEN** no bot notification is enqueued

#### Scenario: Bot down never breaks ingestion
- **WHEN** the bot endpoint fails until retries are exhausted
- **THEN** the message remains ingested and visible in the inbox, and the failure is
  logged with the failed job retained
