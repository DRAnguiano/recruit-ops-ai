# configurable-catalogs (delta)

## ADDED Requirements

### Requirement: Domain value catalogs as data
The system SHALL store companies, circuits, vacancy types and lead statuses as catalog
tables sharing one shape: `name` (unique English/slug domain identifier, immutable after
creation), `label` (Spanish UI text), `active` (soft-hide) and `sortOrder`. Domain values
in business rows reference the catalog by `name`; renaming is not supported — deactivate
and create a new entry instead.

#### Scenario: Catalog entry created and listed in order
- **WHEN** `POST /api/circuits` sends `{name: 'tramo_torreon', label: 'Tramo Torreón'}`
- **THEN** the entry persists and `GET /api/circuits` returns it ordered by `sortOrder`

#### Scenario: Name is immutable
- **WHEN** a PATCH attempts to change an entry's `name`
- **THEN** the API responds 400 and the entry is unchanged

### Requirement: Seeded from real data
The migration SHALL seed: the six current lead statuses (`new`, `in_progress`,
`documents`, `hired`, `discarded`, `no_response`) with their Spanish labels; the four
vacancy types (`sencillo`, `full`, `quinta_rueda`, `escuelita`); and companies/circuits
from the distinct values already present in vacancies, operators, fleet and goals.
Seeding MUST NOT invent values absent from data.

#### Scenario: Existing domain values become catalog
- **WHEN** the migration runs on a database with operators of company "Transmontes"
- **THEN** `companies` contains a `Transmontes` entry and existing rows remain untouched

### Requirement: Catalog-backed validation with cache
Writes that carry domain values (lead status, vacancy type/circuit/company, operator
hired type/circuit, goal company/type/circuit) SHALL be validated against the active
catalog entries through a cached lookup (~60 s TTL). Invalid values respond 400
`VALIDATION_ERROR` listing the allowed names. Deleting a catalog entry referenced by
business rows responds 409 `RESOURCE_REFERENCED`; the seeded `new` lead status is always
present because the lead pipeline depends on it.

#### Scenario: Unknown circuit rejected
- **WHEN** a vacancy is created with a circuit not in the catalog
- **THEN** the API responds 400 `VALIDATION_ERROR` and nothing persists

#### Scenario: Referenced status cannot be deleted
- **WHEN** `DELETE /api/lead-statuses/:id` targets a status used by leads
- **THEN** the API responds 409 `RESOURCE_REFERENCED` and the status remains

#### Scenario: New entry becomes valid without restart
- **WHEN** a new vacancy type is created and ~60 s elapse
- **THEN** vacancies can be created with that type without redeploying

### Requirement: Hired operator records type and circuit
Operators SHALL support optional `operatorType` and `circuit` fields validated against
the catalogs, so hiring records capture what was hired (full/sencillo/…) and for which
circuit.

#### Scenario: Hire captured with type and circuit
- **WHEN** an operator is created or patched with `operatorType='full'` and a catalog
  circuit
- **THEN** both persist and are returned by the operators API
