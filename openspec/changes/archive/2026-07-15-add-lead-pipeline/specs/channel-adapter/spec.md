# channel-adapter (delta)

## MODIFIED Requirements

### Requirement: Common normalized inbound message contract
The system SHALL define a `ChannelAdapter` interface whose `parse(raw)` converts a raw
webhook payload into 0..N normalized inbound messages with: `channel`,
`externalMessageId`, `externalUserId`, optional `senderName`, optional `phoneE164`,
optional `body`, `sentAt` (UTC), optional `referral` (Click-to-WhatsApp ad attribution:
`sourceId`, optional `sourceUrl`, optional `sourceType`, optional `ctwaClid`) and the
untouched `raw` fragment. Adapters MUST be pure (no I/O).

#### Scenario: WhatsApp text message normalized
- **WHEN** a WhatsApp Cloud API payload with one text message is parsed
- **THEN** one normalized message is returned with `channel=whatsapp`, the `wamid` as
  external id, `+<wa_id>` as E.164 phone, the contact profile name, body text and the
  payload timestamp as UTC date

#### Scenario: Telegram update normalized
- **WHEN** a Telegram `message` update is parsed
- **THEN** one normalized message is returned with `channel=telegram`, `<chat_id>_<message_id>`
  as external id, the chat id as external user id and no phone

#### Scenario: Click-to-WhatsApp referral extracted
- **WHEN** a WhatsApp message includes a `referral` object from an ad
- **THEN** the normalized message carries `referral.sourceId` (the ad id) and the available
  referral fields

#### Scenario: Message without referral
- **WHEN** a WhatsApp message has no `referral` object
- **THEN** the normalized message has `referral` undefined
