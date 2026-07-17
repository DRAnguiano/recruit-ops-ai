# campaign-attribution (delta)

## ADDED Requirements

### Requirement: Orphan referral re-attribution after sync
After each campaign sync, leads holding a `referralPayload` and no `campaignId` SHALL be
re-evaluated: when the referral `sourceId` now matches a local campaign's `externalId`,
the lead is attributed (`campaignId` set, `lead.attributed` event with
`reattributed: true`). Leads whose referral still has no matching campaign remain
untouched. The matching rule is shared with the ingestion-time attribution (single
implementation).

#### Scenario: Lead arrives before its campaign
- **WHEN** a lead was ingested with a referral for a campaign not yet local, and a later
  sync brings that campaign
- **THEN** the lead gains its `campaignId` and `lead.attributed` is emitted

#### Scenario: Still unmatched referral
- **WHEN** the referral `sourceId` matches no local campaign after sync
- **THEN** the lead keeps its raw `referralPayload` and no event is emitted
