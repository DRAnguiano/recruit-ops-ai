# domain-events

## Requirements

### Requirement: Append-only domain event log
The system SHALL provide a `domain_events` table with `id` (UUID v7), `type`,
`aggregate_type`, `aggregate_id`, `actor` (system | user | bot | channel), `payload`
(JSONB) and `occurred_at` (UTC). The table MUST be append-only: UPDATE and DELETE are
rejected at the database level.

#### Scenario: Event appended
- **WHEN** domain code emits an event through the internal event API
- **THEN** a row is persisted with all fields and a UTC timestamp

#### Scenario: Mutation rejected
- **WHEN** an UPDATE or DELETE statement targets `domain_events`
- **THEN** the database trigger rejects the statement with an error

### Requirement: Internal emission API
The system SHALL expose a single internal API (`DomainEventsService.append`) as the only
write path to the event log, usable by any domain module without cross-domain imports.

#### Scenario: Module emits without coupling
- **WHEN** any domain module needs to record a fact
- **THEN** it calls the events module public interface only, passing type, aggregate,
  actor and payload

### Requirement: Event querying for metrics
The system SHALL allow reading events filtered by type, aggregate and time range, as the
foundation for all future metrics (no ad-hoc counters).

#### Scenario: Time-range query
- **WHEN** events are queried by type and `occurred_at` range
- **THEN** matching events return ordered by `occurred_at` ascending
