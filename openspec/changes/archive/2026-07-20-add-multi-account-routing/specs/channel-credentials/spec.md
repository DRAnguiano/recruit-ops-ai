# channel-credentials (delta)

## MODIFIED Requirements

### Requirement: Encrypted credential store
The system SHALL persist channel credentials in a `channel_credentials` table with the
secrets encrypted at rest using AES-256-GCM (random 12-byte IV and authentication tag per
row) under a master key from `CHANNEL_CREDENTIALS_KEY`. Each row has a `kind`
(`meta_app`, `whatsapp`, `meta_page`, `telegram`), an `account_external_id` identifying
the account (WhatsApp `phone_number_id`, Meta `page_id`, Telegram bot id; null for the
app-level `meta_app`), a `label`, an `active` flag and the encrypted secrets blob. Partial
unique indexes SHALL enforce at most one `active` row per `(kind, account_external_id)`
for account kinds and a single active `meta_app`. Plaintext secrets MUST NOT be written to
the database or logs.

#### Scenario: Secret encrypted on write
- **WHEN** a credential is created with a secret value
- **THEN** the stored `secrets_encrypted` column is ciphertext that does not contain the
  plaintext, and reading the row back decrypts to the original value

#### Scenario: Two accounts of the same kind coexist
- **WHEN** two `whatsapp` credentials with different `account_external_id` are activated
- **THEN** both persist as active

#### Scenario: Same account activated twice rejected
- **WHEN** a second `whatsapp` credential with an already-active `account_external_id` is
  activated
- **THEN** the database rejects it via the partial unique index

#### Scenario: Single meta_app enforced
- **WHEN** a second `meta_app` credential is activated
- **THEN** the database rejects it (app-level singleton)

### Requirement: Active credential resolution with cache
The system SHALL expose a resolution service returning the decrypted secrets of the active
credential for a given `kind` and optional account: `resolveByAccount(kind, accountId)`
returns the active credential of that account; without an account it returns the single
active credential of the kind, or absent when several are active. The app-level `meta_app`
resolves without an account. Results are cached with a short TTL keyed by `(kind,
account)` and invalidated on any credential mutation. Absent results (no credential or no
master key) never throw at startup.

#### Scenario: Resolves the credential of an account
- **WHEN** two `whatsapp` accounts are active and a sender requests account `A`
- **THEN** the service returns account `A`'s decrypted secrets

#### Scenario: Accountless resolution is ambiguous with several accounts
- **WHEN** two `whatsapp` accounts are active and resolution is requested without an
  account
- **THEN** the service returns absent

#### Scenario: Mutation invalidates the cache
- **WHEN** a credential's secrets are rotated via the API
- **THEN** the next resolution in the same process returns the new secrets without waiting
  for the TTL

### Requirement: Credential CRUD never returns secrets
The system SHALL expose `GET/POST/PATCH/DELETE /api/channel-credentials`. Listing and
detail return only metadata (`kind`, `account_external_id`, `label`, `active`, timestamps)
plus a `configured` boolean — never the secret value nor a mask derived from it. The
`account_external_id` is **derived from the secrets** on write (WhatsApp `phone_number_id`,
Meta `page_id`, Telegram bot id from `bot_token`; null for `meta_app`), not accepted as
input. Create/update validate secrets per `kind`; update without secrets changes only
`label`/`active`. Deleting a credential referenced by conversations SHALL respond 409
`RESOURCE_REFERENCED`. Every mutation emits a `domain_event` with `actor='user'` and no
secret in the payload.

#### Scenario: Listing hides secrets and shows the account
- **WHEN** `GET /api/channel-credentials` is requested
- **THEN** each entry shows `kind`, `account_external_id`, `label`, `active` and
  `configured=true` but no secret value

#### Scenario: Create derives the account from secrets
- **WHEN** `POST /api/channel-credentials` sends a `whatsapp` credential with token and
  phone number id
- **THEN** the row is persisted encrypted with `account_external_id` set to the
  `phone_number_id`, and a `channel_credential.created` event is appended without the
  secret

#### Scenario: Delete of a referenced credential rejected
- **WHEN** a credential referenced by conversations is deleted
- **THEN** the API responds 409 `RESOURCE_REFERENCED` and the credential remains
