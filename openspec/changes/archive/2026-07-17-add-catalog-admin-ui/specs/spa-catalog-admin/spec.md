# spa-catalog-admin (delta)

## ADDED Requirements

### Requirement: Admin view for domain catalogs
The SPA SHALL provide an "Administración" view (own sidebar tab) with editors for the
four domain catalogs (companies, circuits, vacancy types, lead statuses): ordered
listing, creation with `name` + `label`, editing of `label`/`active`/`sortOrder`, and
deletion. `name` is only captured at creation and never editable. All mutations call the
catalog API and re-render from the backend response; typed API errors are surfaced with
their message.

#### Scenario: Create catalog entry from UI
- **WHEN** the user adds a circuit with name and label from the admin view
- **THEN** `POST /api/circuits` is called and the new entry appears in the ordered list

#### Scenario: Referenced delete handled
- **WHEN** deleting an entry referenced by business rows (API responds 409
  `RESOURCE_REFERENCED`)
- **THEN** the UI shows the backend message and suggests deactivating instead; the entry
  remains listed

#### Scenario: Deactivate instead of delete
- **WHEN** the user toggles an entry's `active` off
- **THEN** the entry stops appearing in write dropdowns but historical rows keep
  resolving their label

### Requirement: Goals-per-period editor
The admin view SHALL manage goals: create/edit/delete with `periodKind`
(`weekly`|`monthly`), company, vacancy type and optional circuit chosen from the
catalogs, plus a numeric target. A duplicate-combination 409 from the API is shown
inline without losing the form state.

#### Scenario: Weekly goal created
- **WHEN** a weekly goal is saved for company + type + circuit
- **THEN** `POST /api/goals` persists it and the table shows it grouped by period

#### Scenario: Duplicate goal rejected inline
- **WHEN** the API responds 409 `DUPLICATE_RESOURCE`
- **THEN** the form shows the error and keeps the entered values

### Requirement: Operational settings editable from admin view
The admin view SHALL list the keys exposed by `GET /api/settings` with inputs that save
via `PUT /api/settings/:key`, and SHALL host the work-schedule editor as the single
entry point for editing the schedule (removed from the coverage view).

#### Scenario: Inactivity window changed from UI
- **WHEN** `conversation_inactivity_days` is edited and saved
- **THEN** `PUT /api/settings/conversation_inactivity_days` is called and the new value
  is shown after reload

#### Scenario: Work schedule edited in one place
- **WHEN** the user opens the admin view
- **THEN** the work-schedule form is available there and no duplicate editor exists in
  coverage
