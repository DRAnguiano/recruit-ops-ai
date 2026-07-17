# meta-messaging-channels

## Requirements

### Requirement: Messenger and Instagram inbound ingestion
The Meta webhook SHALL route `object=page` payloads to channel `messenger` and
`object=instagram` payloads to channel `instagram`, parsing `entry[].messaging[]` into
normalized inbound messages: `externalMessageId = message.mid`,
`externalUserId = sender.id` (PSID/IGSID), text body, and attachments
(`audio`/`image`/`video` → same kind, `file` → `document`) as media refs. Echo messages
(`message.is_echo`) and events without a `message` (delivery, read, postbacks) SHALL be
acknowledged without effect. Ingestion, lead pipeline, conversation lifecycle and bot
gateway behave identically to existing channels.

#### Scenario: Messenger text creates person, conversation and lead
- **WHEN** a signed `object=page` webhook arrives with a text message from a new PSID
- **THEN** a person (no phone, no name), channel identity, open conversation on
  `messenger` and lead are created, and `message.received` is emitted

#### Scenario: Instagram attachment ingested as media message
- **WHEN** an `object=instagram` webhook carries an audio attachment with a CDN URL
- **THEN** the message persists with `type='audio'` and media `pending`, and a media
  download job is enqueued

#### Scenario: Echo and non-message events are ignored
- **WHEN** the payload contains only `is_echo` messages or delivery/read events
- **THEN** the webhook responds 200 and nothing is persisted

### Requirement: Identity without phone
People reached via Messenger/Instagram SHALL be created from their channel identity alone
(`phoneE164` and `senderName` null): the webhook carries no phone or profile name and the
system MUST NOT invent them. Phone-based cross-channel dedup applies only once a human
captures the phone.

#### Scenario: Person created with identity only
- **WHEN** a first message arrives from an unknown IGSID
- **THEN** the person row has null phone/name and one `instagram` channel identity

### Requirement: CDN attachment download
Messenger/Instagram media refs SHALL store the signed CDN URL as `externalId`; the media
downloader fetches it directly (no token — authorization is embedded in the URL) through
the existing `channels.media` queue, subject to the same size limit and `stored`/`failed`
contract. The CDN URL is never served to clients; stored media is exposed only via
`GET /api/messages/:id/media`.

#### Scenario: Attachment stored from CDN URL
- **WHEN** the media job runs for a messenger attachment whose URL is still valid
- **THEN** the binary is saved via MediaStorage and media becomes `stored`

#### Scenario: Expired CDN URL fails visibly
- **WHEN** the CDN URL has expired and retries are exhausted
- **THEN** media ends `failed` with the HTTP error, without affecting the message row

### Requirement: Referral attribution from Meta messaging ads
When `messaging[].referral` (or `postback.referral`) is present, the adapter SHALL map it
to the normalized referral (`sourceId = ad_id` when present, otherwise `ref`), feeding the
existing campaign attribution pipeline; without referral the lead remains `organic`.

#### Scenario: Click-to-Messenger ad attributes the lead
- **WHEN** the first message carries `referral.ad_id` matching a campaign's `externalId`
- **THEN** the lead is attributed to that campaign with origin `paid`

### Requirement: Send API outbound for Messenger and Instagram
Outbound text SHALL be delivered via
`POST {GRAPH_API_BASE_URL}/{pageId}/messages` with
`{recipient: {id}, messaging_type: 'RESPONSE', message: {text}}` authenticated by the
active `meta_page` credential's page access token resolved from the encrypted store, one
sender class per channel. No active `meta_page` credential → the channel is not configured
and sends respond 409 `CHANNEL_NOT_CONFIGURED`. The response `message_id` is stored as the
delivery's external message id.

#### Scenario: Reply to a Messenger conversation
- **WHEN** an agent sends text to an open messenger conversation within the window
- **THEN** the Send API is called with the person's PSID and delivery transitions
  `queued → sent` with the returned `message_id`

#### Scenario: Unconfigured page rejects send
- **WHEN** no active `meta_page` credential resolves from the store
- **THEN** the API responds 409 `CHANNEL_NOT_CONFIGURED` and nothing is persisted
