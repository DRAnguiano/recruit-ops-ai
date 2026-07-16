# deterministic-classification

## ADDED Requirements

### Requirement: Classification rules stored as data
Classification keywords SHALL live in a `classification_rules` table (`category` ∈
{`ad_cta`, `internal_hr`, `vacancy_type`}, optional `target`, `keywords` as JSONB string
array, `active` flag) — never hardcoded. The initial migration MUST seed the rules
currently proven in the SPA (`src/utils/whatsappParser.ts`).

#### Scenario: Seed present after migration
- **WHEN** migrations run on an empty database
- **THEN** active rules exist for ad CTAs, internal-HR keywords and the four vacancy types
  (sencillo, full, quinta_rueda, escuelita)

#### Scenario: Rule change without code change
- **WHEN** a keyword is added to a rule row
- **THEN** the engine uses it on the next classification without redeploy

### Requirement: Pure classification engine
The system SHALL classify via a pure function of (text, rules) returning classification
(`vacancy` | `internal_hr` | `other`), optional detected vacancy type and the matched
rule; matching MUST be case-insensitive and accent-insensitive.

#### Scenario: Internal HR detected
- **WHEN** a message contains an `internal_hr` keyword (e.g. "nómina", "infonavit")
- **THEN** the result is `internal_hr`

#### Scenario: Vacancy type detected with accents ignored
- **WHEN** a message contains "TRÁILER" and a `vacancy_type` rule targets `quinta_rueda`
  with keyword "trailer"
- **THEN** the result is `vacancy` with detected type `quinta_rueda`

#### Scenario: No match
- **WHEN** a message matches no rule
- **THEN** the result is `other` with no detected type

### Requirement: Conservative accumulation
Lead classification SHALL only improve over messages: a lead classified `vacancy` or
`internal_hr` MUST NOT regress to `other`, and a detected vacancy type is only replaced by
another explicit match.

#### Scenario: Later unrelated message does not reset
- **WHEN** a lead classified `vacancy`/`quinta_rueda` sends "ok gracias"
- **THEN** classification and type remain unchanged
