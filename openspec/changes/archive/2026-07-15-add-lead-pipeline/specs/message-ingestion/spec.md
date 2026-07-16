# message-ingestion (delta)

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Lead pipeline invocation
After a message is persisted (not on duplicates), the ingestion SHALL invoke the lead
pipeline outside the persistence transaction.

#### Scenario: Duplicate does not re-run pipeline
- **WHEN** an already-ingested message is delivered again
- **THEN** the lead pipeline is not invoked
