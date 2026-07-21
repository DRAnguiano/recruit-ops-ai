# channel-webhooks (delta)

## MODIFIED Requirements

### Requirement: Telegram webhook authentication
`POST /webhooks/telegram/:accountId` SHALL require the `X-Telegram-Bot-Api-Secret-Token`
header to match the `webhook_secret` of the active `telegram` credential whose
`account_external_id` equals `:accountId`, resolved from the encrypted store; mismatches or
the absence of that credential MUST be rejected with 403. The `:accountId` is threaded to
the parsed messages as their destination account so replies go through the same bot. Each
bot registers `setWebhook` to its own path.

#### Scenario: Valid secret token on the bot's path
- **WHEN** Telegram sends an update to `/webhooks/telegram/:accountId` with the correct
  secret header for that bot's credential
- **THEN** the parsed messages are enqueued on `channels.inbound` tagged with that account
  and the API responds 200

#### Scenario: Secret of a different bot rejected
- **WHEN** the secret header matches a different bot's credential than `:accountId`
- **THEN** the API responds 403 and nothing is enqueued nor persisted

#### Scenario: Unknown account path rejected
- **WHEN** `:accountId` has no active `telegram` credential
- **THEN** the API responds 403
