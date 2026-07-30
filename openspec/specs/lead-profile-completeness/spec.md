# lead-profile-completeness

## Purpose

El panel de campos personalizados muestra el % de cumplimiento del perfil (candidato + persona)
sobre los campos requeridos, con el desglose de lo que falta — un indicador de completitud de
captura, no un puntaje de aptitud.

## Requirements

### Requirement: Profile completeness shown with breakdown
The custom-fields panel SHALL show, for the current candidate (lead + person), the count and
percentage of required custom fields that have a non-null value, together with the labels of the
required fields still missing. The calculation SHALL use the currently active `required` field
definitions and their current values; it SHALL NOT be a static/cached number.

#### Scenario: Partial completion shown with missing fields listed
- **WHEN** the panel loads a candidate with 11 required fields, 6 of them filled
- **THEN** it shows "6/11" with the percentage, and lists the labels of the 5 missing required
  fields

#### Scenario: Full completion
- **WHEN** all required fields for the candidate have a value
- **THEN** the indicator shows 100% and no missing-fields list

#### Scenario: No required fields defined
- **WHEN** there are no fields marked `required` for the candidate's entities
- **THEN** no completeness indicator is shown (no division by zero, no misleading 100%/0%)

### Requirement: Completeness is presentational, not a score
The completeness indicator SHALL be a deterministic count of filled-vs-required fields. It SHALL
NOT weight fields, infer suitability, or otherwise function as a scoring/decision mechanism.

#### Scenario: All required fields count equally
- **WHEN** the completeness percentage is computed
- **THEN** every required field contributes the same weight regardless of which field it is
