# spa-api-client (delta)

## MODIFIED Requirements

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
