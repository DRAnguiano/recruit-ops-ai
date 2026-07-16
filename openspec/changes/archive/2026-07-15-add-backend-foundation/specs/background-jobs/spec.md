# background-jobs

## ADDED Requirements

### Requirement: BullMQ job infrastructure
The system SHALL provide Redis + BullMQ infrastructure with a single shared pattern for
registering queues and workers per domain module, with queue names prefixed by domain
(e.g. `campaigns.sync`, `channels.outbound`).

#### Scenario: Module registers a queue
- **WHEN** a domain module registers a queue through the shared queue module
- **THEN** the queue and its worker are created with the domain-prefixed name and the
  connection settings from validated environment variables

#### Scenario: Job processed end to end
- **WHEN** a job is enqueued on a registered queue
- **THEN** its worker processes it and the result/failure is observable in tests

### Requirement: Job failure visibility
Failed jobs SHALL be retained (not auto-removed) with their error, and worker errors MUST
be logged with the queue name and job id.

#### Scenario: Failing job retained
- **WHEN** a job handler throws
- **THEN** the job ends in failed state with the error message and remains inspectable
