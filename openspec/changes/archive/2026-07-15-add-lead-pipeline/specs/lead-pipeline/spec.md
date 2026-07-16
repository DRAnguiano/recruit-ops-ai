# lead-pipeline

## ADDED Requirements

### Requirement: Automatic lead per person
Every ingested inbound message SHALL guarantee a lead for its person (at most one lead per
person). The first message MUST set `first_message_at`, `arrival_hour`, `arrival_day` and
`in_work_hours` evaluated against the applicable schedule's IANA timezone.

#### Scenario: First message creates lead
- **WHEN** a message from a person without lead is ingested
- **THEN** a lead is created with status `new`, arrival data and a `lead.created` event

#### Scenario: Subsequent message reuses lead
- **WHEN** a message from a person with an existing lead is ingested
- **THEN** no new lead is created and `first_message_at` keeps its original value

### Requirement: Pipeline runs after persistence
The lead pipeline SHALL run after the ingestion transaction commits; a pipeline failure
MUST NOT prevent message persistence, and the pipeline MUST be re-runnable from stored
messages.

#### Scenario: Classification error does not lose messages
- **WHEN** the pipeline throws while processing a persisted message
- **THEN** the message row remains and the error is logged

### Requirement: Human values take precedence
Lead fields whose `classification_source` is `human` SHALL never be overwritten by the
pipeline.

#### Scenario: Human correction preserved
- **WHEN** a lead classified by a human receives new messages
- **THEN** the pipeline does not change classification nor detected vacancy type
