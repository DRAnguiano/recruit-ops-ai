# catalog-api

## Requirements

### Requirement: CRUD for operational catalogs
The system SHALL expose REST CRUD under `/api` for: campaigns, job vacancies, agents,
operators, fleet, goals, work schedules, classification rules, and the domain value
catalogs (companies, circuits, vacancy types, lead statuses). Domain values are
validated against the catalogs (not code enums); deletes on rows referenced by other
tables MUST fail with a typed domain error instead of cascading.

#### Scenario: Create vacancy
- **WHEN** `POST /api/vacancies` sends type, circuit, modality, company and quota with
  catalog-valid values
- **THEN** the vacancy persists with `status=open` and is returned with its id

#### Scenario: Referenced row cannot be deleted
- **WHEN** a DELETE targets an agent assigned to conversations or leads
- **THEN** the API responds with a typed domain error and the agent remains

#### Scenario: Catalog mutations audited
- **WHEN** any catalog row is created, updated or deleted via the API
- **THEN** a corresponding domain event is appended with `actor='user'`

#### Scenario: Goals support weekly and monthly periods
- **WHEN** `POST /api/goals` sends `{periodKind: 'weekly', company, vacancyType,
  circuit, target}`
- **THEN** the goal persists, is unique per (periodKind, company, vacancyType, circuit)
  and duplicates respond 409

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

### Requirement: Campaign contract uses spend + currency
Campaign endpoints (CRUD and bulk) SHALL expose and accept `spend` and `currency`
(ISO-4217, default `USD`) instead of `spendMxn`. `PATCH /api/campaigns/:id` SHALL accept
`currency` for manually-sourced campaigns; for `source='meta_api'` campaigns the
periodic sync keeps overwriting currency with the ad account's real value.

#### Scenario: Bulk CSV with currency
- **WHEN** `POST /api/campaigns/bulk` sends items with `spend` and no currency
- **THEN** campaigns persist with `currency='USD'` and reimporting stays idempotent

#### Scenario: Manual currency edit
- **WHEN** a CSV campaign is patched with `currency='MXN'`
- **THEN** the currency persists and is returned by the campaigns API
