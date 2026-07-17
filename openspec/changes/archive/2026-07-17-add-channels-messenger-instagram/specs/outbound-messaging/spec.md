# outbound-messaging (delta)

## MODIFIED Requirements

### Requirement: Channel senders behind a common interface
Outbound delivery SHALL go through a per-channel `ChannelSender` implementation (WhatsApp
Cloud API `/{phoneNumberId}/messages`; Telegram `sendMessage`; Messenger and Instagram
Send API `/{META_PAGE_ID}/messages`), each using the conversation's channel identity as
recipient and API base URLs configurable via environment for testability. Channels
without a sender respond 409 `CHANNEL_NOT_SUPPORTED`. Template sends on channels other
than WhatsApp respond 409 `TEMPLATES_NOT_SUPPORTED`.

#### Scenario: Telegram send uses chat id from identity
- **WHEN** an agent sends text to a Telegram conversation
- **THEN** the sender calls `sendMessage` with the `chat_id` derived from the person's
  channel identity and stores the returned message id

#### Scenario: Messenger send uses PSID from identity
- **WHEN** an agent sends text to a messenger conversation
- **THEN** the Send API is called with `recipient.id` = the person's PSID and the
  returned `message_id` is stored

#### Scenario: Template on non-WhatsApp channel rejected
- **WHEN** a template send targets a messenger or instagram conversation
- **THEN** the API responds 409 `TEMPLATES_NOT_SUPPORTED` and nothing is persisted
