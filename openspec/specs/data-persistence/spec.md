# data-persistence

## Requirements

### Requirement: Versioned SQL migrations
The system SHALL manage the PostgreSQL schema exclusively through versioned migrations
(Drizzle ORM + drizzle-kit); manual schema changes outside migrations are not allowed.

#### Scenario: Migrations apply on empty database
- **WHEN** migrations run against an empty database
- **THEN** all tables are created and the command exits successfully and idempotently on a
  second run

### Requirement: Initial recruitment domain schema
The system SHALL provide the initial schema derived from the SPA domain model
(`src/types.ts`): `people`, `channel_identities`, `conversations`, `messages`, `leads`,
`campaigns`, `job_vacancies`, `agents`, `operators`, `fleet`, `monthly_goals`,
`work_schedules`. All timestamps MUST be stored as `timestamptz` in UTC.

#### Scenario: Multichannel identity model
- **WHEN** a person exists with identities on two channels (e.g. WhatsApp and Telegram)
- **THEN** both identities reference the same `people` row via `channel_identities`, each
  with its channel type and external id

#### Scenario: Message idempotency key
- **WHEN** two messages with the same channel and `external_message_id` are inserted
- **THEN** the unique constraint rejects the duplicate

#### Scenario: Phone deduplication key
- **WHEN** a person is stored
- **THEN** their phone is persisted normalized (E.164) and is unique across `people`

### Requirement: Business enums as validated data, not DB enums
Business-level enumerations (lead status, classification, vacancy type, campaign status)
SHALL be stored as text columns validated in the domain layer, not as PostgreSQL enum
types, so they can become UI-configurable catalogs later without destructive migrations.

#### Scenario: New status value added
- **WHEN** a new lead status is introduced in a later change
- **THEN** no ALTER TYPE migration is required; only domain validation changes

### Requirement: Raw payload retention
The `messages` table SHALL retain the original channel payload in a `raw_payload` JSONB
column so that future parsing improvements can reprocess historical messages.

#### Scenario: Webhook payload preserved
- **WHEN** a message row is created from a channel event
- **THEN** the unmodified source payload is stored alongside the normalized columns
