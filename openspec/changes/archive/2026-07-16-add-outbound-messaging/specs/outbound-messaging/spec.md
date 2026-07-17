# outbound-messaging (delta)

## ADDED Requirements

### Requirement: Persist-then-send outbound pipeline
`POST /api/conversations/:id/messages` SHALL validate (open conversation, supported and
configured channel, window policy), persist the outbound message with
`delivery.status='queued'` and `actor`-attributed `message.sent` event, and enqueue a
`channels.outbound` job (jobId = message id) that delivers it through the channel sender
with retries. On success the delivery becomes `sent` with the channel's external message
id; exhausted retries mark it `failed` with the error.

#### Scenario: Recruiter sends free-form text
- **WHEN** an agent posts `{ body }` to an open WhatsApp conversation within the 24h window
- **THEN** the message row exists before delivery, the worker sends it via Cloud API and
  `delivery.status` transitions `queued → sent` with the returned `wamid`

#### Scenario: Channel not configured
- **WHEN** a send is attempted for WhatsApp without `WHATSAPP_ACCESS_TOKEN` or
  `WHATSAPP_PHONE_NUMBER_ID`
- **THEN** the API responds 409 `CHANNEL_NOT_CONFIGURED` and nothing is persisted

#### Scenario: Delivery failure after retries
- **WHEN** the channel API keeps failing until job attempts are exhausted
- **THEN** the message remains persisted with `delivery.status='failed'` and the error, and
  `message.delivery_updated` is emitted

### Requirement: Channel senders behind a common interface
Outbound delivery SHALL go through a per-channel `ChannelSender` implementation (WhatsApp
Cloud API `/{phoneNumberId}/messages`; Telegram `sendMessage` using the conversation's
channel identity), with API base URLs configurable via environment for testability.
Channels without a sender respond 409 `CHANNEL_NOT_SUPPORTED`.

#### Scenario: Telegram send uses chat id from identity
- **WHEN** an agent sends text to a Telegram conversation
- **THEN** the sender calls `sendMessage` with the `chat_id` derived from the person's
  channel identity and stores the returned message id

#### Scenario: Unsupported channel rejected
- **WHEN** a send targets a conversation on a channel without sender (e.g. messenger)
- **THEN** the API responds 409 `CHANNEL_NOT_SUPPORTED` and nothing is enqueued

### Requirement: Outbound messages visible in inbox immediately
Outbound messages SHALL appear in `GET /api/conversations/:id/messages` with their
`delivery` state, update the conversation's `lastMessageAt`, and be broadcast over the
existing WebSocket as domain events.

#### Scenario: Sent message updates conversation activity
- **WHEN** an outbound message is persisted
- **THEN** the conversation's `lastMessageAt` reflects it and the message lists with
  `direction='outbound'` and its delivery status
