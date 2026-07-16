# queued-ingestion

## ADDED Requirements

### Requirement: Webhook enqueues instead of ingesting inline
Authenticated webhook requests SHALL parse the payload and enqueue each normalized
message on the `channels.inbound` queue (jobId = `<channel>__<externalMessageId>`), responding
200 after enqueueing. Ingestion and the lead pipeline run in the queue worker with the
same semantics and idempotency as before.

#### Scenario: ACK independent of Postgres
- **WHEN** a valid webhook arrives while Postgres is unavailable
- **THEN** the webhook still responds 200 and the message is processed when the worker
  retries succeed

#### Scenario: Worker processes to the same result
- **WHEN** a text message goes through webhook → queue → worker
- **THEN** the resulting rows and events are identical to the former inline ingestion

### Requirement: Queue-level deduplication
Using `<channel>__<externalMessageId>` as jobId, provider retries arriving while a job is
queued SHALL NOT create duplicate jobs; the Postgres unique constraint remains the final
idempotency guarantee.

#### Scenario: Retry while queued
- **WHEN** the same message is enqueued twice before the worker runs
- **THEN** only one job executes and one message row results
