# employment-episodes (delta)

## MODIFIED Requirements

### Requirement: Immutable hire record per employment episode
The system SHALL record each hire as an employment episode with an immutable snapshot of its
attribution — the operator, hire date, and (when a candidate lead matched) the person, the lead, the
recruiter who hired (`hiredByAgent`) and the attributed campaign. Once a snapshot field is set it
SHALL NOT be overwritten. There is one episode per operator. This applies whether the lead was
linked manually or through automatic phone attribution.

#### Scenario: Episode opened on hire with frozen attribution
- **WHEN** a candidate lead is linked to an operator, manually or via automatic phone attribution
- **THEN** an employment episode is ensured for that operator with `hiredByAgent`, `campaign`,
  `lead`, `person` and `hireDate` snapshotted from the hire, and a domain event records it

#### Scenario: Later changes to the lead do not alter the snapshot
- **WHEN** the lead's assigned agent or campaign changes after the episode was opened
- **THEN** the episode keeps the recruiter and campaign it snapshotted at hire time

#### Scenario: Hire without a matched lead has no invented attribution
- **WHEN** an operator has no matched candidate lead
- **THEN** its episode exists with the operator and hire date, and null recruiter/campaign (never
  fabricated)

#### Scenario: One episode per operator (idempotent)
- **WHEN** the backfill or the hire path runs more than once for the same operator
- **THEN** exactly one episode exists for that operator
