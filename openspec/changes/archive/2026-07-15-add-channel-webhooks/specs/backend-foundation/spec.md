# backend-foundation (delta)

## ADDED Requirements

### Requirement: Optional channel configuration variables
The environment schema SHALL accept optional channel variables (`META_APP_SECRET`,
`META_VERIFY_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`). Their absence MUST NOT prevent startup;
it only disables the corresponding webhook endpoint (403).

#### Scenario: Startup without channel secrets
- **WHEN** the backend starts with only the base variables configured
- **THEN** it boots normally and channel webhooks respond 403 until configured

#### Scenario: Channel variables documented
- **WHEN** the channel variables are added to the zod schema
- **THEN** they appear in `.env.example` with explanatory comments
