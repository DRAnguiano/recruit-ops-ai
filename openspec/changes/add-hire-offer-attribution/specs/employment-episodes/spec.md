# employment-episodes (delta)

## ADDED Requirements

### Requirement: Employment episode freezes the campaign's current offer at hire time
When an employment episode is opened or enriched with a campaign attribution, the system SHALL
resolve that campaign's current published offer (highest published version) at that moment and
freeze it on the episode. Once set, the frozen offer reference SHALL NOT be overwritten, even if
the campaign later publishes a newer offer version.

#### Scenario: Offer frozen when campaign has a published offer
- **WHEN** an episode is opened for a campaign that has at least one published offer
- **THEN** the episode's offer reference is set to that campaign's current published version at
  that moment

#### Scenario: No offer captured when none is published
- **WHEN** an episode is opened for a campaign with no published offer
- **THEN** the episode's offer reference stays null — it is never fabricated

#### Scenario: Later offer versions do not change an already-frozen reference
- **WHEN** a campaign publishes a new offer version after an episode already has an offer frozen
- **THEN** the episode keeps referencing the offer version it froze at hire time

### Requirement: Frozen offer is readable with the hire record
The system SHALL expose, alongside each employment episode, a summary of its frozen offer (version,
announced salary, validity period) when one was captured.

#### Scenario: Offer summary included when present
- **WHEN** an episode has a frozen offer reference
- **THEN** its summary (version, announced salary, validity) is included in the episode listing

#### Scenario: No summary when no offer was captured
- **WHEN** an episode has no frozen offer reference
- **THEN** its listing shows no offer summary, distinguishing this from a fabricated one
