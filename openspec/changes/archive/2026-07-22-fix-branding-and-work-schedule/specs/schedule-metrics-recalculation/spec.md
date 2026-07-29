# schedule-metrics-recalculation (delta)

## ADDED Requirements

### Requirement: Recalculate work-hour metrics for existing leads on demand
The system SHALL expose an operation that recomputes the derived work-hour metrics
(`inWorkHours`, `arrivalHour`, `arrivalDay`) of existing leads against the currently active
`work_schedule`, using the same computation the ingestion pipeline uses, so the metrics can be
corrected whenever the official schedule changes without re-ingesting messages.

#### Scenario: Recalculation after a schedule correction
- **WHEN** the active `work_schedule` changes and the recalculation operation runs
- **THEN** every lead with a `firstMessageAt` has its `inWorkHours`, `arrivalHour` and `arrivalDay`
  recomputed against the current schedule, and the operation returns how many leads were scanned and
  how many were updated

#### Scenario: Leads without a first message are skipped
- **WHEN** a lead has no `firstMessageAt`
- **THEN** its work-hour metrics are left unchanged

#### Scenario: Recalculation is auditable
- **WHEN** the recalculation operation completes
- **THEN** a domain event records that the recalculation ran and how many leads were updated
