# employment-episodes (delta)

## ADDED Requirements

### Requirement: Immutable hire record per employment episode
The system SHALL record each hire as an employment episode with an immutable snapshot of its
attribution — the operator, hire date, and (when a candidate lead matched) the person, the lead, the
recruiter who hired (`hiredByAgent`) and the attributed campaign. Once a snapshot field is set it
SHALL NOT be overwritten. There is one episode per operator.

#### Scenario: Episode opened on hire with frozen attribution
- **WHEN** a candidate lead is linked to an operator
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

### Requirement: Episode type distinguishes new hire from rehire
Each employment episode SHALL carry a type of `new` or `rehire`, marking `rehire` when the same
person already has a prior episode, so a rehire is not counted as a new marketing-sourced hire.

#### Scenario: Second episode of the same person is a rehire
- **WHEN** an episode is created for a person who already has a prior episode
- **THEN** the new episode is typed `rehire`

### Requirement: Employment episodes are readable
The system SHALL expose the employment episodes for reading, including the operator, hire date,
recruiter, campaign and type, to support a hire-record view.

#### Scenario: List episodes
- **WHEN** the client requests the employment episodes
- **THEN** it receives each episode's operator, hire date, recruiter, campaign and type
