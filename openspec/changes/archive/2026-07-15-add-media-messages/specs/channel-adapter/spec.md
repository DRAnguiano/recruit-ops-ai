# channel-adapter (delta)

## MODIFIED Requirements

### Requirement: Common normalized inbound message contract
The system SHALL define a `ChannelAdapter` interface whose `parse(raw)` converts a raw
webhook payload into 0..N normalized inbound messages with: `channel`,
`externalMessageId`, `externalUserId`, optional `senderName`, optional `phoneE164`,
optional `body`, `sentAt` (UTC), optional `referral` (Click-to-WhatsApp ad attribution:
`sourceId`, optional `sourceUrl`, optional `sourceType`, optional `ctwaClid`), a `kind`
(`text | audio | image | document | video`) with optional `media` reference
(`externalId`, `mimeType`, `filename`, `caption`) and the untouched `raw` fragment.
Adapters MUST be pure (no I/O) and MUST NOT download media.

#### Scenario: WhatsApp text message normalized
- **WHEN** a WhatsApp Cloud API payload with one text message is parsed
- **THEN** one normalized message is returned with `channel=whatsapp`, `kind=text`, the
  `wamid` as external id, `+<wa_id>` as E.164 phone, the contact profile name, body text
  and the payload timestamp as UTC date

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

#### Scenario: WhatsApp voice note normalized
- **WHEN** a WhatsApp `audio` (or voice) message is parsed
- **THEN** one normalized message is returned with `kind=audio` and `media.externalId`
  set to the WhatsApp media id

#### Scenario: Telegram photo with caption
- **WHEN** a Telegram `photo` message with caption is parsed
- **THEN** one normalized message is returned with `kind=image`, the largest photo's
  `file_id` as `media.externalId` and the caption as `body`

### Requirement: Tolerant parsing of unrecognized payloads
Adapters SHALL return an empty list (never throw) for payloads without processable
messages — delivery statuses, edited messages, and message kinds not yet supported
(stickers, reactions, locations, contacts of third parties) — so that webhooks can
always ACK.

#### Scenario: Status payload yields nothing
- **WHEN** a WhatsApp payload containing only `statuses` is parsed
- **THEN** the adapter returns an empty list

#### Scenario: Non-message Telegram update
- **WHEN** a Telegram update without `message` (e.g. `edited_message`, `my_chat_member`) is parsed
- **THEN** the adapter returns an empty list

#### Scenario: Sticker yields nothing
- **WHEN** a WhatsApp sticker or reaction message is parsed
- **THEN** the adapter returns an empty list
