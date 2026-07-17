# campaign-attribution

## Requirements

### Requirement: Referral-based attribution
When an inbound message carries a Click-to-WhatsApp `referral`, the lead SHALL be
attributed to the campaign whose `external_id` equals `referral.source_id`, setting
`origin` to `paid` and emitting `lead.attributed`.

#### Scenario: Known campaign
- **WHEN** a first message arrives with referral `source_id` matching a campaign
- **THEN** the lead has `campaign_id` set, `origin=paid` and a `lead.attributed` event exists

### Requirement: Raw referral retained for late attribution
If no campaign matches the referral yet, the system SHALL store the raw referral payload
on the lead so a later campaign sync can re-attribute.

#### Scenario: Campaign not yet synced
- **WHEN** a referral arrives whose `source_id` matches no campaign
- **THEN** the lead keeps `referral_payload` and has no `campaign_id`

### Requirement: Organic fallback
Messages without referral SHALL leave the lead with `origin=organic` (never invented
attribution).

#### Scenario: Organic first contact
- **WHEN** a first message without referral is ingested
- **THEN** the lead has `origin=organic` and no campaign

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
