# custom-fields

## Requirements

### Requirement: Custom field dictionary as data, one pair of tables per entity
The system SHALL persist custom field definitions in `lead_field_definitions` and
`person_field_definitions` (same shape, one per entity), each with `key` (unique within
its table, immutable after creation — referenced by values and future score criteria),
`label`, `type` (`text`, `number`, `boolean`, `select`, `date`), `options` (a non-empty
string list, required only for `select`), `required`, `active`, and `sortOrder`. A
definition is deactivated, never renamed. Business enums (the `type`) are validated in the
domain layer, never as Postgres enums.

#### Scenario: Create a lead field definition
- **WHEN** `POST /api/lead-field-definitions` sends `{ key:'licencia',
  label:'Tipo de licencia', type:'select', options:['A','B','C'], required:true }`
- **THEN** the definition is persisted active and a `lead_field.definition_created` event
  is appended

#### Scenario: Key is immutable
- **WHEN** `PATCH /api/lead-field-definitions/:id` or
  `PATCH /api/person-field-definitions/:id` attempts to change `key`
- **THEN** the API responds 400 `VALIDATION_ERROR` and the stored `key` is unchanged

#### Scenario: Select requires options
- **WHEN** a `select` definition is created without a non-empty `options` list
- **THEN** the API responds 400 `VALIDATION_ERROR`

#### Scenario: Duplicate key rejected
- **WHEN** a second definition with an existing `key` is created in the same dictionary
  (lead or person)
- **THEN** the API responds 409 `DUPLICATE_RESOURCE`

### Requirement: Definition CRUD with referential delete guard
The system SHALL expose `GET/POST/PATCH/DELETE /api/lead-field-definitions` and
`/api/person-field-definitions`. Listing returns definitions ordered by `sortOrder`.
Update changes `label`, `type`, `options`, `required`, `active` and `sortOrder` but never
`key`. Deleting a definition that has stored values SHALL respond 409
`RESOURCE_REFERENCED`; deactivating it instead keeps its values.

#### Scenario: List ordered by sortOrder
- **WHEN** `GET /api/lead-field-definitions` is requested
- **THEN** definitions are returned ordered by `sortOrder`

#### Scenario: Delete of a referenced definition rejected
- **WHEN** a definition with at least one stored value is deleted
- **THEN** the API responds 409 `RESOURCE_REFERENCED` and the definition remains

#### Scenario: Delete of an unused definition succeeds
- **WHEN** a definition with no stored values is deleted
- **THEN** the definition is removed and a `lead_field.definition_deleted` (or
  `person_field.definition_deleted`) event is appended

### Requirement: Typed custom field values with evidence, referencing their entity
The system SHALL persist custom field values in `lead_field_values` (FK to `leads.id`,
`ON DELETE CASCADE`) and `person_field_values` (FK to `people.id`, `ON DELETE CASCADE`),
at most one row per `(definition_id, lead_id)` / `(definition_id, person_id)`. Each value
is validated against its definition's `type`: `number` numeric, `boolean` true/false,
`date` ISO-8601, `select` one of `options`, `text` free string. Every value carries
`source` (`human` | `ai`), optional `evidenceText` (verbatim quote) and optional
`evidenceMessageId` (the message it was extracted from). The `setValue` service operation
SHALL enforce that a write with `source='ai'` MUST NOT overwrite a value whose `source` is
`human`; a `human` write always wins and sets `source='human'`.

#### Scenario: Value validated against its type
- **WHEN** `PUT /api/leads/:id/custom-fields/experiencia` sends `{ value:'cinco' }` for a
  `number` definition
- **THEN** the API responds 400 `VALIDATION_ERROR` and nothing is stored

#### Scenario: Select value must be an allowed option
- **WHEN** a value for a `select` definition is not one of its `options`
- **THEN** the API responds 400 `VALIDATION_ERROR` listing the allowed options

#### Scenario: Value stored via the public endpoint is always human-sourced
- **WHEN** `PUT /api/leads/:id/custom-fields/licencia` sends `{ value:'A' }`
- **THEN** the value is upserted with `source='human'` (any `source` in the request body is
  ignored) and a `lead_field.value_set` event is appended

#### Scenario: Human correction wins over a prior ai value
- **WHEN** the `setValue` service is called with `source='human'` for a field that
  currently holds a `source='ai'` value
- **THEN** the value is replaced and `source` becomes `human`

#### Scenario: Ai write never overwrites a human value
- **WHEN** the `setValue` service is called with `source='ai'` for a field that currently
  holds a `source='human'` value
- **THEN** the stored value and its `source='human'` are unchanged

### Requirement: Reading an entity's custom fields
The system SHALL expose `GET /api/leads/:id/custom-fields` and
`GET /api/people/:id/custom-fields` returning, for that entity's active definitions, each
definition together with its stored value (or null), including `source` and evidence.

#### Scenario: Fields listed with values and gaps
- **WHEN** `GET /api/leads/:id/custom-fields` is requested and the lead has two of three
  active definitions filled
- **THEN** all three active definitions are returned, two with their value/source/evidence
  and one with a null value

#### Scenario: Unknown entity id
- **WHEN** the entity id does not exist
- **THEN** the API responds 404 `NOT_FOUND`
