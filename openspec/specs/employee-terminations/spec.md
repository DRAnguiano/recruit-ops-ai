# employee-terminations

## Purpose

Registro histórico de bajas con motivo/tipo normalizado, permanencia calculada y vínculo opcional
(nunca inventado) a un operador vigente — base de datos para la analítica de permanencia.

## Requirements

### Requirement: Historical termination records with normalized type and tenure
The system SHALL persist historical termination ("baja") records with the employee name, circuit,
hire date, termination date, a normalized termination type (one of `renuncia_voluntaria`,
`abandono_trabajo`, `rescision_contrato`, `pension_incapacidad`, or null when the source text does
not match any of them, in which case the raw text is kept separately), short reason, detailed
reason, comment, and computed tenure in days (termination date minus hire date, when both are
present).

#### Scenario: Recognized termination type normalized
- **WHEN** a termination row's source type text matches one of the four known categories
  (accent/case-insensitive)
- **THEN** it is stored as the normalized category

#### Scenario: Unrecognized type is not forced into a category
- **WHEN** a termination row's source type text does not match any known category
- **THEN** the normalized type is null and the raw text is preserved separately

#### Scenario: Tenure computed when both dates are present
- **WHEN** a termination row has both hire date and termination date
- **THEN** tenure in days is computed and stored

### Requirement: Optional, never-guessed link to a current operator
When importing a termination record, the system SHALL attempt to link it to a current operator by
employee number when present in the source, otherwise by an exact normalized name match. It SHALL
link only when the match is unambiguous (exactly one candidate); otherwise the record is stored
unlinked.

#### Scenario: Linked by employee number
- **WHEN** a termination row includes an employee number matching exactly one operator
- **THEN** the termination is linked to that operator

#### Scenario: Linked by unambiguous name match
- **WHEN** a termination row has no employee number but its normalized name matches exactly one
  operator's normalized name
- **THEN** the termination is linked to that operator

#### Scenario: Ambiguous or missing match stays unlinked
- **WHEN** a termination row's name matches zero or more than one operator
- **THEN** the termination is stored with no operator link, and the raw name is preserved

### Requirement: Re-importing overlapping sources does not duplicate
The system SHALL deduplicate termination records by normalized employee name and termination date,
so importing sheets whose date ranges overlap (e.g. a weekly sheet re-listing entries already in a
monthly sheet) does not create duplicate records.

#### Scenario: Overlapping weekly and monthly sheets deduplicate
- **WHEN** the same person's termination appears in both a monthly sheet and a weekly sheet with the
  same name and termination date
- **THEN** only one termination record exists after import

#### Scenario: Re-import is idempotent
- **WHEN** the same import is run twice
- **THEN** the second run creates no new records

### Requirement: Terminations are readable
The system SHALL expose the termination records for reading, to support tenure and reason analytics
in a subsequent capability.

#### Scenario: List terminations
- **WHEN** the client requests the termination records
- **THEN** it receives each record's employee name, circuit, dates, normalized type, tenure, and
  operator link (if any)

### Requirement: Tenure analytics over loaded terminations
The system SHALL expose aggregated tenure analytics computed from the loaded termination records:
global milestones (count and percentage of terminations with tenure ≤30, ≤60, and ≤90 days, plus
the median tenure), a breakdown by normalized termination type (count and percentage), and a
breakdown by circuit (count with valid tenure, count within 90 days, percentage, and median
tenure), ordered by highest early-attrition percentage first.

#### Scenario: Global milestones computed from records with valid tenure
- **WHEN** the analytics endpoint is requested
- **THEN** it returns the count and percentage of terminations with tenure ≤30, ≤60 and ≤90 days,
  computed only over records that have a computed tenure

#### Scenario: Breakdown by termination type
- **WHEN** the analytics endpoint is requested
- **THEN** it returns, for each normalized termination type present, its count and share of total
  terminations

#### Scenario: Breakdown by circuit ordered by early attrition
- **WHEN** the analytics endpoint is requested
- **THEN** it returns, per circuit with at least one termination, the count with valid tenure, the
  count within 90 days, the percentage, and the median tenure — ordered by that percentage
  descending

#### Scenario: No fabricated tenure
- **WHEN** a termination record has no computed tenure (missing hire or termination date)
- **THEN** it is excluded from the milestone and median calculations, not counted as zero

### Requirement: Tenure and terminations view in the SPA
The Atribución y Contratos view SHALL show a «Permanencia y Bajas» section presenting the tenure
analytics — summary KPIs, milestone breakdown, type breakdown, and the per-circuit table — with an
empty state when no terminations are loaded.

#### Scenario: Section shown when terminations exist
- **WHEN** the Atribución y Contratos view renders and terminations are loaded
- **THEN** the Permanencia y Bajas section shows the KPIs and breakdowns

#### Scenario: Empty state when no terminations are loaded
- **WHEN** no terminations exist
- **THEN** the section shows an empty state instead of a blank or zero-filled display
