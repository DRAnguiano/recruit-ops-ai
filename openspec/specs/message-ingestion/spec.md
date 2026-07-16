# message-ingestion

## Requirements

### Requirement: Idempotent message persistence
The ingestion service SHALL persist each normalized inbound message exactly once, using
the `channel + external_message_id` unique constraint (`ON CONFLICT DO NOTHING`). A
webhook retry with an already-ingested message MUST have no observable effect (no rows,
no events).

#### Scenario: Duplicate delivery
- **WHEN** the same webhook payload is ingested twice
- **THEN** exactly one message row exists and events are emitted only for the first ingestion

### Requirement: Person and channel identity resolution
For each inbound message the system SHALL resolve the person by: (1) existing channel
identity, (2) existing person with the same E.164 phone, (3) creating a new person. The
channel identity MUST be created when missing and always linked to the resolved person.

#### Scenario: Known identity reused
- **WHEN** a second message from the same WhatsApp user arrives
- **THEN** no new person or identity rows are created

#### Scenario: Same phone on new channel
- **WHEN** a message arrives from a new channel identity whose phone matches an existing person
- **THEN** the new identity is linked to the existing person

#### Scenario: Unknown sender
- **WHEN** a message arrives from an unknown identity without matching phone
- **THEN** a new person, identity and conversation are created

### Requirement: Conversation continuity
Inbound messages SHALL be appended to the open conversation for that person+channel,
creating one if none exists, and `last_message_at` MUST be updated. A conversation whose
`last_message_at` is older than the configurable inactivity window
(`app_settings.conversation_inactivity_days`, default 21) SHALL be closed
(`status=closed`, `closed_at` set, `conversation.closed` event) at resolution time, and
the new message MUST open a new conversation. Closed conversations and their history are
never deleted.

#### Scenario: Existing open conversation
- **WHEN** a person with an open WhatsApp conversation sends another message
- **THEN** the message joins that conversation and no new conversation is created

#### Scenario: Conversation expired by inactivity
- **WHEN** a message arrives and the open conversation's `last_message_at` is older than
  the configured inactivity days
- **THEN** that conversation is closed with `closed_at` set, a `conversation.closed` event
  is emitted, and the message starts a new conversation

#### Scenario: Inactivity window is configurable
- **WHEN** `conversation_inactivity_days` is changed in `app_settings`
- **THEN** subsequent resolutions use the new value without redeploy

### Requirement: Domain events for ingestion facts
The ingestion SHALL emit `person.created`, `conversation.started` and `message.received`
domain events (actor `channel`) for facts that actually occurred in that ingestion.

#### Scenario: First contact emits full set
- **WHEN** a message from a completely new sender is ingested
- **THEN** `person.created`, `conversation.started` and `message.received` are all emitted

#### Scenario: Follow-up message emits only reception
- **WHEN** a message from a known sender with an open conversation is ingested
- **THEN** only `message.received` is emitted

### Requirement: Lead pipeline invocation
After a message is persisted (not on duplicates), the ingestion SHALL invoke the lead
pipeline outside the persistence transaction.

#### Scenario: Duplicate does not re-run pipeline
- **WHEN** an already-ingested message is delivered again
- **THEN** the lead pipeline is not invoked
