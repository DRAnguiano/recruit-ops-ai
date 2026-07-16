# work-hours-engine

## Requirements

### Requirement: Schedule evaluation in IANA timezone
The system SHALL determine whether an instant falls within a work schedule by evaluating
it in the schedule's IANA timezone (via `Intl`), never the server timezone, honoring DST.

#### Scenario: Server TZ irrelevant
- **WHEN** the same UTC instant is evaluated with any server TZ setting
- **THEN** the in-work-hours result is identical and matches `America/Mexico_City` local time

#### Scenario: Outside work days
- **WHEN** an instant falls on a non-work day of the schedule
- **THEN** it is not in work hours

### Requirement: Work minutes between instants
The system SHALL compute elapsed work minutes between two instants counting only minutes
inside the schedule's work days and time window, in the schedule's timezone.

#### Scenario: Span across a weekend
- **WHEN** start is Friday 16:00 and end is Monday 08:45 (schedule L-V 07:45–17:10)
- **THEN** only Friday 16:00–17:10 plus Monday 07:45–08:45 minutes are counted

#### Scenario: End before start
- **WHEN** end ≤ start
- **THEN** the result is 0
