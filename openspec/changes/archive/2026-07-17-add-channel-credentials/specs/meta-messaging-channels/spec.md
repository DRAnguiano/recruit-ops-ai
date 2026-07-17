# meta-messaging-channels (delta)

## MODIFIED Requirements

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
