# catalog-api (delta)

## MODIFIED Requirements

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
