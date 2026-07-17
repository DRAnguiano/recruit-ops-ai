# catalog-api

## ADDED Requirements

### Requirement: CRUD for operational catalogs
The system SHALL expose REST CRUD under `/api` for: campaigns, job vacancies, agents,
operators, fleet, monthly goals, work schedules and classification rules. Domain values
are English enums per the schema; deletes on rows referenced by other tables MUST fail
with a typed domain error instead of cascading.

#### Scenario: Create vacancy
- **WHEN** `POST /api/vacancies` sends type, circuit, modality, company and quota
- **THEN** the vacancy persists with `status=open` and is returned with its id

#### Scenario: Referenced row cannot be deleted
- **WHEN** a DELETE targets an agent assigned to conversations or leads
- **THEN** the API responds with a typed domain error and the agent remains

#### Scenario: Catalog mutations audited
- **WHEN** any catalog row is created, updated or deleted via the API
- **THEN** a corresponding domain event is appended with `actor='user'`

### Requirement: Operational settings endpoint
The system SHALL expose `GET/PUT` for `app_settings` keys used by the UI (e.g.
`conversation_inactivity_days`) and for the default work schedule, validating each value
against its zod schema.

#### Scenario: Change inactivity window
- **WHEN** `conversation_inactivity_days` is set to 30 via the API
- **THEN** the setting persists and the inactivity close job uses the new value

### Requirement: Bulk operator upsert
The system SHALL expose `POST /api/operators/bulk` performing a transactional upsert
keyed by `empNo` (normalized phones included), responding `{ created, updated }`.
Re-sending the same batch MUST be idempotent.

#### Scenario: Excel import round-trip
- **WHEN** the SPA posts 200 parsed operator rows twice
- **THEN** the first call reports creations, the second reports only updates, and no
  duplicate rows exist

### Requirement: Bulk campaign upsert (CSV fallback)
The system SHALL expose `POST /api/campaigns/bulk` performing a transactional upsert
keyed by `externalId` when present, otherwise by `name` + `isoWeek`, marking rows
`source='csv'`, responding `{ created, updated }`.

#### Scenario: CSV re-import is safe
- **WHEN** the same campaign CSV batch is posted twice
- **THEN** no duplicate campaigns are created and metrics reflect the latest values
