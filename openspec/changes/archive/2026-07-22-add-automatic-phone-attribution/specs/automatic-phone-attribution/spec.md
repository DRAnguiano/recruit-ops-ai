# automatic-phone-attribution (delta)

## ADDED Requirements

### Requirement: Unambiguous phone matches are persisted as attribution
The system SHALL persist a candidate-to-operator attribution when a WhatsApp candidate's phone
(last 10 digits) matches exactly one unlinked operator's `normalizedPhones` (which already merges
company, personal, and partner/family phone), and that operator is not already linked. Persisting
the match links the operator to the lead and marks the lead as hired, the same effect as the manual
attribution panel.

#### Scenario: Unique phone match gets linked and hired
- **WHEN** exactly one unlinked candidate's phone matches exactly one unlinked operator's phones
- **THEN** the lead is linked to that operator, the lead's status becomes `hired`, and the
  operator's employment episode is opened/enriched with the attribution

#### Scenario: Partner/family phone counts as a match
- **WHEN** the match comes from the operator's partner/family phone (already folded into
  `normalizedPhones` at import time)
- **THEN** it is treated the same as any other phone match

### Requirement: Ambiguous matches are reported, never guessed
When a phone matches more than one candidate or more than one operator, the system SHALL NOT link
any of them automatically; it SHALL report the ambiguity for human review.

#### Scenario: Shared phone is not auto-linked
- **WHEN** a phone number matches more than one operator or more than one unlinked candidate
- **THEN** no link is created for that phone, and it appears in the ambiguous results

### Requirement: Re-running the match is safe
The system SHALL skip operators and leads that are already linked, so running the phone match again
does not duplicate or override existing attributions.

#### Scenario: Idempotent re-run
- **WHEN** the phone match runs a second time
- **THEN** already-linked operators and leads are excluded, and no existing link is changed
