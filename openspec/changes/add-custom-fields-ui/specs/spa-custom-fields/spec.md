# spa-custom-fields (delta)

## ADDED Requirements

### Requirement: Dictionary editors in Administration
The Administration view SHALL offer two tables (lead and person field definitions),
listing definitions ordered by `sortOrder`, creating with `key`/`label`/`type`/`options`
(shown only for `type='select'`)/`required`, editing `label`/`type`/`options`/`required`/
`active`/`sortOrder` (never `key`, immutable), and deleting with a clear message on 409
`RESOURCE_REFERENCED` suggesting deactivation instead.

#### Scenario: Create a select definition
- **WHEN** the recruiter fills key/label/type=select/options and submits
- **THEN** the definition appears in the table active, and the options list is only
  requested/shown for `select`

#### Scenario: Delete blocked by stored values
- **WHEN** deleting a definition that has stored values fails with 409
- **THEN** the UI shows the backend message and suggests deactivating instead of deleting

### Requirement: Dynamic value form in the chat viewer
The chat viewer's prospect metadata panel SHALL render, for the open lead and its person,
one input per active custom field definition matching its `type` (text, number, boolean,
select, date), pre-filled with the stored value when present. Saving a field calls
`PUT .../custom-fields/:key` and updates only that field's state from the response, without
reloading the conversation thread.

#### Scenario: Fields load when opening a conversation
- **WHEN** a recruiter opens a lead's chat
- **THEN** the panel shows an input per active lead definition and per active person
  definition, with any stored values pre-filled

#### Scenario: Saving a value updates its state from the backend
- **WHEN** the recruiter edits a text field and it saves successfully
- **THEN** the field reflects the persisted value and `source='human'` without a full
  reload of the thread

### Requirement: Typed error feedback on value writes
A 400 `VALIDATION_ERROR` response to a value write SHALL be shown inline next to the
field; for `select` fields the allowed options from the error response are displayed.

#### Scenario: Invalid select value shows allowed options
- **WHEN** a select field write is rejected with `VALIDATION_ERROR` and an `allowed` list
- **THEN** the UI shows those allowed values inline next to the field

### Requirement: AI-sourced values are visually distinguished
A field whose stored value has `source='ai'` SHALL render a small indicator distinguishing
it from a `human`-sourced value; this is purely informational and does not change how the
value is edited or saved.

#### Scenario: AI value shows a badge
- **WHEN** a field's stored value has `source='ai'`
- **THEN** the field renders with a distinguishing badge; editing and saving it behaves
  identically to any other field
