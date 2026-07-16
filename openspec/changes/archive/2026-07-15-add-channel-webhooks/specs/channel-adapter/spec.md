# channel-adapter

## ADDED Requirements

### Requirement: Common normalized inbound message contract
The system SHALL define a `ChannelAdapter` interface whose `parse(raw)` converts a raw
webhook payload into 0..N normalized inbound messages with: `channel`,
`externalMessageId`, `externalUserId`, optional `senderName`, optional `phoneE164`,
optional `body`, `sentAt` (UTC) and the untouched `raw` fragment. Adapters MUST be pure
(no I/O).

#### Scenario: WhatsApp text message normalized
- **WHEN** a WhatsApp Cloud API payload with one text message is parsed
- **THEN** one normalized message is returned with `channel=whatsapp`, the `wamid` as
  external id, `+<wa_id>` as E.164 phone, the contact profile name, body text and the
  payload timestamp as UTC date

#### Scenario: Telegram update normalized
- **WHEN** a Telegram `message` update is parsed
- **THEN** one normalized message is returned with `channel=telegram`, `<chat_id>_<message_id>`
  as external id, the chat id as external user id and no phone

### Requirement: Tolerant parsing of unrecognized payloads
Adapters SHALL return an empty list (never throw) for payloads without processable
messages — delivery statuses, edited messages, non-text updates they do not yet support —
so that webhooks can always ACK.

#### Scenario: Status payload yields nothing
- **WHEN** a WhatsApp payload containing only `statuses` is parsed
- **THEN** the adapter returns an empty list

#### Scenario: Non-message Telegram update
- **WHEN** a Telegram update without `message` (e.g. `edited_message`, `my_chat_member`) is parsed
- **THEN** the adapter returns an empty list
