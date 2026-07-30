# employee-terminations (delta)

## ADDED Requirements

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
