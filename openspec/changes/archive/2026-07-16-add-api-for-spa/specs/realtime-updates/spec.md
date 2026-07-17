# realtime-updates

## ADDED Requirements

### Requirement: WebSocket event broadcast
The system SHALL expose a WebSocket endpoint (`/ws`) that broadcasts to every connected
client a JSON frame `{ type, payload }` for inbox-relevant domain events at minimum:
`message.received`, `message.media_stored`, `lead.created`, `lead.updated`,
`conversation.assigned`, `conversation.attention_mode_changed`, `conversation.closed`.
Payloads carry the aggregate id and the event payload, never internal file paths.

#### Scenario: Inbound message reaches connected clients
- **WHEN** an inbound message is ingested while two clients are connected
- **THEN** both receive a `message.received` frame with the conversation and message ids

#### Scenario: Media stored notifies viewer
- **WHEN** a media download job completes
- **THEN** connected clients receive `message.media_stored` for that message

### Requirement: Broadcast failures never break ingestion
Publishing to WebSocket clients SHALL be fire-and-forget: a slow, disconnected or failing
client MUST NOT make event appending, ingestion or workers fail, and MUST NOT lose or
delay persistence.

#### Scenario: Client drops mid-broadcast
- **WHEN** a client socket errors while an event is broadcast
- **THEN** the message ingestion transaction still completes and other clients receive
  the frame

### Requirement: Same-process event subscription
The events module SHALL expose a public in-process subscription interface used by the
WebSocket gateway, so appended domain events are published to subscribers in the same
process after persistence. No cross-module internal imports are introduced.

#### Scenario: Event appended then published
- **WHEN** `DomainEventsService.append()` persists an event
- **THEN** in-process subscribers receive it after the append succeeds
