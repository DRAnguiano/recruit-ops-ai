# delivery-status

## Requirements

### Requirement: Delivery state on outbound messages
Outbound messages SHALL carry `messages.delivery` JSONB
(`queued → sent → delivered → read`, or `failed` with the channel error). States only
advance (a late `delivered` after `read` is ignored); inbound messages carry no delivery.

#### Scenario: States never regress
- **WHEN** a `delivered` status arrives after `read` was already applied
- **THEN** the message stays `read` and no event is emitted

### Requirement: WhatsApp status webhooks update delivery
The WhatsApp adapter SHALL parse `statuses` entries (previously discarded) and the
ingestion worker SHALL apply them by `channel + external_message_id`, emitting
`message.delivery_updated` on every applied change (idempotent: re-applying the same
status emits nothing). Statuses for unknown messages are logged and ignored.

#### Scenario: Delivered then read
- **WHEN** Meta posts `delivered` and later `read` for a sent wamid
- **THEN** the message's delivery advances accordingly and two
  `message.delivery_updated` events reach WebSocket clients

#### Scenario: Failed status carries the error
- **WHEN** Meta posts a `failed` status with an error object
- **THEN** `delivery.status='failed'` and the error detail is stored and broadcast
