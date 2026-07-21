# meta-messaging-channels (delta)

## MODIFIED Requirements

### Requirement: Messenger and Instagram inbound ingestion
The Meta webhook SHALL route `object=page` payloads to channel `messenger` and
`object=instagram` payloads to channel `instagram`, parsing `entry[].messaging[]` into
normalized inbound messages: `externalMessageId = message.mid`,
`externalUserId = sender.id` (PSID/IGSID), text body, attachments
(`audio`/`image`/`video` → same kind, `file` → `document`) as media refs, and
`destinationAccount = entry[].id` (the page id that received it). Echo messages
(`message.is_echo`) and events without a `message` (delivery, read, postbacks) SHALL be
acknowledged without effect. Ingestion, lead pipeline, conversation lifecycle and bot
gateway behave identically to existing channels.

#### Scenario: Messenger text creates person, conversation and lead
- **WHEN** a signed `object=page` webhook arrives with a text message from a new PSID
- **THEN** a person (no phone, no name), channel identity, open conversation on
  `messenger` and lead are created, the conversation records the page id as its account,
  and `message.received` is emitted

#### Scenario: Instagram attachment ingested as media message
- **WHEN** an `object=instagram` webhook carries an audio attachment with a CDN URL
- **THEN** the message persists with `type='audio'` and media `pending`, and a media
  download job is enqueued

#### Scenario: Echo and non-message events are ignored
- **WHEN** the payload contains only `is_echo` messages or delivery/read events
- **THEN** the webhook responds 200 and nothing is persisted
