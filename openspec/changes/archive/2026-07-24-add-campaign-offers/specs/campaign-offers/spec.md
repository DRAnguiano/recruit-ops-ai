# campaign-offers (delta)

## ADDED Requirements

### Requirement: Versioned offer per campaign with immutable publish
The system SHALL persist an offer per campaign as a sequence of versions. A new offer starts as
`draft` and is editable; publishing (`status='published'`) fixes its content permanently — no
endpoint SHALL allow editing a published offer. Publishing again creates a new version instead of
modifying the previous one; every published version remains stored and unchanged.

#### Scenario: Draft is editable
- **WHEN** an offer is in `draft` status
- **THEN** its content fields can be updated via the API

#### Scenario: Publishing freezes the content
- **WHEN** a draft offer is published
- **THEN** its status becomes `published`, `publishedAt` is set, and further edit attempts are
  rejected

#### Scenario: A new version does not alter the previous one
- **WHEN** a new offer version is created and published for a campaign that already has a published
  version
- **THEN** the previous published version's content is unchanged and remains retrievable

### Requirement: Current offer is derived, never a mutable flag
The system SHALL determine a campaign's current offer as the highest-versioned `published` offer
for that campaign, computed at read time rather than stored as an editable flag.

#### Scenario: Current offer reflects the latest published version
- **WHEN** a campaign has multiple published offer versions
- **THEN** the current offer is the one with the highest version number

#### Scenario: No published offer means no current offer
- **WHEN** a campaign has only a draft (no published version)
- **THEN** the campaign has no current offer

### Requirement: Offer content captures what was promised
Each offer version SHALL capture the content promised to candidates: announced salary, payment
form, bonuses, benefits, per-diem, rest days, schedule, route type, circuit, unit type, vacancy
type, whether units are announced as new, unit condition, maintenance culture, operator care,
safety, stability, family-directed message, substance-free policy, requirements, location, ad
text, creative reference, call to action, and validity period (from/to).

#### Scenario: Offer stores its full content
- **WHEN** an offer version is created or updated while in draft
- **THEN** all provided content fields are stored as given, without being forced into an unrelated
  taxonomy

### Requirement: Offers are readable per campaign
The system SHALL expose the offer versions for a campaign, including which one (if any) is current.

#### Scenario: List versions for a campaign
- **WHEN** the client requests a campaign's offers
- **THEN** it receives all versions (draft and published) with their status and version number
