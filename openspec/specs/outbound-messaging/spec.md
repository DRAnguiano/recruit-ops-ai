# outbound-messaging

## Requirements

### Requirement: Persist-then-send outbound pipeline
`POST /api/conversations/:id/messages` SHALL validate (open conversation, supported and
configured channel, window policy), persist the outbound message with
`delivery.status='queued'` and `actor`-attributed `message.sent` event, and enqueue a
`channels.outbound` job (jobId = message id) that delivers it through the channel sender
with retries. On success the delivery becomes `sent` with the channel's external message
id; exhausted retries mark it `failed` with the error. A channel is "configured" when its
active credential resolves from the encrypted store.

#### Scenario: Recruiter sends free-form text
- **WHEN** an agent posts `{ body }` to an open WhatsApp conversation within the 24h window
- **THEN** the message row exists before delivery, the worker sends it via Cloud API and
  `delivery.status` transitions `queued → sent` with the returned `wamid`

#### Scenario: Channel not configured
- **WHEN** a send is attempted for WhatsApp and no active `whatsapp` credential resolves
  from the store
- **THEN** the API responds 409 `CHANNEL_NOT_CONFIGURED` and nothing is persisted

#### Scenario: Delivery failure after retries
- **WHEN** the channel API keeps failing until job attempts are exhausted
- **THEN** the message remains persisted with `delivery.status='failed'` and the error, and
  `message.delivery_updated` is emitted

### Requirement: Channel senders behind a common interface
Outbound delivery SHALL go through a per-channel `ChannelSender` implementation (WhatsApp
Cloud API `/{phoneNumberId}/messages`; Telegram `sendMessage`; Messenger and Instagram
Send API `/{pageId}/messages`), each resolving its account credentials (tokens and ids)
from the encrypted credential store **for the conversation's `channel_account`** (falling
back to the single active credential of the kind when the conversation has none), and using
the conversation's channel identity as recipient, with API base URLs configurable via
environment for testability. Channels without a sender respond 409 `CHANNEL_NOT_SUPPORTED`.
Template sends on channels other than WhatsApp respond 409 `TEMPLATES_NOT_SUPPORTED`.

#### Scenario: Reply resolves the conversation's account
- **WHEN** an agent sends to a WhatsApp conversation whose `channel_account` is number `A`
- **THEN** the sender resolves account `A`'s credential and calls Cloud API
  `/{A}/messages`, storing the returned `wamid`

#### Scenario: Telegram send uses the bot of the conversation's account
- **WHEN** an agent sends text to a Telegram conversation on bot account `B`
- **THEN** the sender resolves bot `B`'s token and calls `sendMessage` with the `chat_id`
  from the person's channel identity, storing the returned message id

#### Scenario: Messenger send uses PSID from identity
- **WHEN** an agent sends text to a messenger conversation
- **THEN** the Send API is called with `recipient.id` = the person's PSID using the
  conversation's `meta_page` account credential and the returned `message_id` is stored

#### Scenario: Template on non-WhatsApp channel rejected
- **WHEN** a template send targets a messenger or instagram conversation
- **THEN** the API responds 409 `TEMPLATES_NOT_SUPPORTED` and nothing is persisted

### Requirement: Outbound messages visible in inbox immediately
Outbound messages SHALL appear in `GET /api/conversations/:id/messages` with their
`delivery` state, update the conversation's `lastMessageAt`, and be broadcast over the
existing WebSocket as domain events.

#### Scenario: Sent message updates conversation activity
- **WHEN** an outbound message is persisted
- **THEN** the conversation's `lastMessageAt` reflects it and the message lists with
  `direction='outbound'` and its delivery status
