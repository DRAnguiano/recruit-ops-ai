# campaign-sync (delta)

## ADDED Requirements

### Requirement: Read-only Marketing API sync
The system SHALL periodically sync campaigns from the Meta Marketing API (campaign list +
campaign-level insights + account currency) using `META_ADS_ACCESS_TOKEN` and
`META_AD_ACCOUNT_ID`, upserting locally by `externalId` with `source='meta_api'`. The sync
MUST be read-only towards Meta, never fabricate data, update only Meta-owned fields
(spend, currency, clicks, leadsReported, status, dates) and leave local business fields
and campaigns without `externalId` untouched. Without token/account configured the sync is
disabled with a log. Each run emits `campaign.synced` with counters.

#### Scenario: New remote campaign appears
- **WHEN** a sync runs and Meta returns a campaign whose `externalId` does not exist
- **THEN** it is created with `source='meta_api'`, real spend/clicks/leads and the account
  currency

#### Scenario: CSV campaign adopted by sync
- **WHEN** a campaign imported by CSV shares `externalId` with a synced one
- **THEN** its metrics and `source` are updated to `meta_api`, keeping local fields
  (`targetAgentId`, `vacancyId`, `modality`) intact

#### Scenario: Not configured
- **WHEN** the sync job runs without `META_ADS_ACCESS_TOKEN`
- **THEN** nothing changes and the skip is logged (no error, no fake data)

### Requirement: Periodic job with configurable interval and manual trigger
The sync SHALL run as a repeatable BullMQ job whose interval comes from the
`campaign_sync_interval_minutes` setting (default 60), and `POST /api/campaigns/sync`
SHALL enqueue an immediate run (202, deduplicated) emitting an `actor='user'` event, or
respond 409 `MARKETING_NOT_CONFIGURED` when credentials are missing.

#### Scenario: Manual trigger
- **WHEN** `POST /api/campaigns/sync` is called with credentials configured
- **THEN** a sync job is enqueued and campaigns reflect Meta data shortly after

### Requirement: Campaign money carries explicit currency
Campaigns SHALL store `spend` plus a `currency` ISO-4217 column (default `USD`), replacing
`spend_mxn`. The API and bulk import expose/accept `spend` and `currency`; synced
campaigns take the ad account's currency.

#### Scenario: Account currency applied
- **WHEN** the ad account reports currency `USD`
- **THEN** synced campaigns persist `currency='USD'` and the API returns it
