# leads-api (delta)

## MODIFIED Requirements

### Requirement: Human lead updates
The system SHALL expose `PATCH /api/leads/:id` accepting `status`, `notes`,
`assignedAgentId`, `classification` and `detectedVacancyType`. `status` is validated
against the `lead-statuses` catalog (active entries), not a code enum; the list filter
accepts any catalog status. Human classification changes MUST set
`classificationSource='human'`. Every applied change emits `lead.updated` with
`actor='user'` and the changed fields in the payload.

#### Scenario: Recruiter advances status
- **WHEN** a lead is patched with `status=in_progress`
- **THEN** the status persists and `lead.updated` is appended with `actor='user'`

#### Scenario: Human classification override sticks
- **WHEN** a lead classification is corrected via PATCH
- **THEN** `classificationSource` becomes `human` and subsequent pipeline messages do not
  overwrite the classification

#### Scenario: Invalid status rejected
- **WHEN** a PATCH sends a status outside the catalog
- **THEN** the API responds 400 `VALIDATION_ERROR` listing allowed statuses and the lead
  is unchanged

#### Scenario: Catalog-added status accepted
- **WHEN** a new status is added to the catalog and a lead is patched with it
- **THEN** the update succeeds without code changes
