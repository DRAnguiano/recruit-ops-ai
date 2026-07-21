# multi-account-routing (delta)

## ADDED Requirements

### Requirement: Inbound tagged with its destination account
Each normalized inbound message SHALL carry the identifier of the account of ours that
received it: WhatsApp from `value.metadata.phone_number_id`, Messenger/Instagram from
`entry[].id` (the page id), Telegram from the webhook path (`:accountId`). When the
payload lacks it, the field is absent and downstream falls back to the single active
credential of the channel.

#### Scenario: WhatsApp inbound carries phone number id
- **WHEN** a WhatsApp message webhook is parsed
- **THEN** the normalized message's destination account is the `phone_number_id` from the
  payload metadata

#### Scenario: Messenger inbound carries page id
- **WHEN** a Messenger message is parsed
- **THEN** the normalized message's destination account is the `entry.id` (page id)

### Requirement: Conversation records its channel account
When a conversation is created or continued from an inbound message, the system SHALL
store the message's destination account on `conversations.channel_account`. Outbound sends
on that conversation resolve the channel credential for that account.

#### Scenario: New conversation stores the account
- **WHEN** an inbound message with destination account `A` opens a conversation
- **THEN** the conversation persists `channel_account = A`

#### Scenario: Reply uses the conversation's account
- **WHEN** an agent replies to a conversation whose `channel_account` is `A`
- **THEN** the sender resolves the credential of account `A` and delivers through it

### Requirement: Fallback for conversations without an account
For conversations lacking a `channel_account` (created before this change), outbound
sends SHALL resolve the channel's credential only when exactly one active credential of
that kind exists; when several accounts are active the send is ambiguous and responds 409
`CHANNEL_NOT_CONFIGURED`.

#### Scenario: Single account fallback still sends
- **WHEN** a legacy conversation without `channel_account` sends and only one `whatsapp`
  credential is active
- **THEN** the send resolves that single credential and delivers

#### Scenario: Ambiguous multi-account send rejected
- **WHEN** a legacy conversation without `channel_account` sends and two `whatsapp`
  credentials are active
- **THEN** the API responds 409 `CHANNEL_NOT_CONFIGURED` and nothing is persisted
