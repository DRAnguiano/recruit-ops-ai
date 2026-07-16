# message-ingestion

## ADDED Requirements

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
creating one if none exists, and `last_message_at` MUST be updated.

#### Scenario: Existing open conversation
- **WHEN** a person with an open WhatsApp conversation sends another message
- **THEN** the message joins that conversation and no new conversation is created

### Requirement: Domain events for ingestion facts
The ingestion SHALL emit `person.created`, `conversation.started` and `message.received`
domain events (actor `channel`) for facts that actually occurred in that ingestion.

#### Scenario: First contact emits full set
- **WHEN** a message from a completely new sender is ingested
- **THEN** `person.created`, `conversation.started` and `message.received` are all emitted

#### Scenario: Follow-up message emits only reception
- **WHEN** a message from a known sender with an open conversation is ingested
- **THEN** only `message.received` is emitted
