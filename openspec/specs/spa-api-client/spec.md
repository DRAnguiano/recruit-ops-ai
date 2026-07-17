# spa-api-client

## Requirements

### Requirement: SPA reads exclusively from the backend API
The SPA SHALL load all its data (leads, operators, campaigns, fleet, goals, vacancies,
work schedule/settings) from the REST API at startup, following `nextCursor` pagination
until exhaustion for paginated listings. IndexedDB reads, default-data seeding and the
JSON backup/restore MUST be removed; if the API is unreachable the UI shows a connection
error, never fake data.

#### Scenario: Startup loads from API
- **WHEN** the SPA mounts with the backend reachable
- **THEN** every view renders data served by the API and IndexedDB is not queried

#### Scenario: API unreachable
- **WHEN** the backend is down at startup
- **THEN** the UI shows a connection error instead of seeded/demo data

### Requirement: Domain-to-UI mapping layer
A dedicated mapping layer SHALL translate API domain values (English) to the UI's Spanish
labels and back for writes (classification, vacancy type, origin, modality, operator
status, campaign status), keeping the existing `types.ts` shapes so views change
minimally. Lead status labels MUST NOT be a fixed dictionary: they are resolved from the
`lead-statuses` catalog loaded at boot (`name` → `label`), falling back to the raw
`name` for entries missing from the catalog. Status dropdowns (CRM tray select and list
filter) and status-based counters offer/derive from catalog entries — active entries for
writes, all entries for display. Phones map E.164 ↔ last-10-digits for display and
matching.

#### Scenario: Lead mapped to ChatLead
- **WHEN** a lead with `status='new'`, `classification='vacancy'`,
  `detectedVacancyType='quinta_rueda'` is fetched
- **THEN** the UI shows the catalog label for `new` / `Vacante` / `5ta Rueda` and the
  10-digit phone

#### Scenario: UI write mapped back to domain
- **WHEN** a recruiter sets a lead to the label of `hired`
- **THEN** the API receives `PATCH` with `status='hired'`

#### Scenario: Catalog-added status appears without code changes
- **WHEN** a new lead status is created in the admin view
- **THEN** the CRM tray select and filter offer it using its Spanish label

### Requirement: Lead and catalog writes go through the API
Lead updates (status, notes, agent, operator link) and catalog edits (vacancies, fleet,
goals, work schedule, settings) SHALL call their API endpoints and replace local state
with the backend response; on typed API errors the UI surfaces the message and keeps the
previous state.

#### Scenario: Status change persists
- **WHEN** a lead status changes in the CRM tray
- **THEN** `PATCH /api/leads/:id` is called and the row reflects the response
