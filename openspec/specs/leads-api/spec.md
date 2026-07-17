# leads-api

## Requirements

### Requirement: Lead listing and detail
The system SHALL expose `GET /api/leads` (paginated, filterable by `status`,
`classification`, `detectedVacancyType`, `assignedAgentId`, `origin`, `campaignId` and
first-message date range) and `GET /api/leads/:id` including person data, pipeline
metrics (`responded`, first-response minutes, `inWorkHours`, arrival hour/day), campaign
and matched operator.

#### Scenario: CRM tray listing
- **WHEN** `GET /api/leads?status=new` is requested
- **THEN** new leads are returned with person phone/name, classification, detected
  vacancy type and response metrics

#### Scenario: Detail includes attribution
- **WHEN** the detail of a lead attributed via referral is requested
- **THEN** the response includes its `campaignId` and origin

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

### Requirement: Manual operator link
The system SHALL expose an endpoint to link or unlink a lead to an operator
(`matchedOperatorId` nullable, operator must exist), emitting `lead.operator_matched`
with `actor='user'`.

#### Scenario: Link hired lead to operator
- **WHEN** a lead is linked to an existing operator id
- **THEN** `matchedOperatorId` persists and the event is appended

#### Scenario: Unknown operator rejected
- **WHEN** the link references a non-existent operator
- **THEN** the API responds with a typed domain error and nothing changes
