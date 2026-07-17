# catalog-api (delta)

## MODIFIED Requirements

### Requirement: Campaign contract uses spend + currency
Campaign endpoints (CRUD and bulk) SHALL expose and accept `spend` and `currency`
(ISO-4217, default `USD`) instead of `spendMxn`.

#### Scenario: Bulk CSV with currency
- **WHEN** `POST /api/campaigns/bulk` sends items with `spend` and no currency
- **THEN** campaigns persist with `currency='USD'` and reimporting stays idempotent
