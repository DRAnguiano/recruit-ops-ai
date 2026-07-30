# whatsapp-history-import (delta)

## ADDED Requirements

### Requirement: History import persists first-response metrics on the lead
When importing WhatsApp history, the system SHALL accept and persist the first-response metrics that
the parser computed from the exported recruiter replies — `responded`,
`firstResponseMinutesNatural` and `firstResponseMinutesWork` — on the corresponding lead, so the
dashboard reflects real response rate and reaction time. These metrics come from the export (real
recruiter timestamps), never fabricated.

#### Scenario: Metrics persisted for a replied conversation
- **WHEN** the import payload includes first-response metrics for a person and that person's lead
  exists
- **THEN** the lead is updated with `responded`, `firstResponseMinutesNatural` and
  `firstResponseMinutesWork`, and a domain event records the import as the source

#### Scenario: Re-import overwrites deterministically
- **WHEN** the same history is imported again
- **THEN** the lead's first-response metrics are set to the same values (idempotent), without
  duplicating messages or altering `firstMessageAt` or status

#### Scenario: Leads without metrics are untouched
- **WHEN** the payload has no metric for a given person
- **THEN** that person's lead keeps its existing first-response values

#### Scenario: Business-hours time uses the active schedule
- **WHEN** `firstResponseMinutesWork` is computed for the import
- **THEN** it reflects the currently active work schedule (07:30–17:30), consistent with the
  work-hours engine
