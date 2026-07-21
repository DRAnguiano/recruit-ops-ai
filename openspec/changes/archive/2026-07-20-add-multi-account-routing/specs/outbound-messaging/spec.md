# outbound-messaging (delta)

## MODIFIED Requirements

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

#### Scenario: Template on non-WhatsApp channel rejected
- **WHEN** a template send targets a messenger or instagram conversation
- **THEN** the API responds 409 `TEMPLATES_NOT_SUPPORTED` and nothing is persisted
