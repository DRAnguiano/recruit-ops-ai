# channel-credentials

## Purpose

Keep per-channel secrets (Meta app secret/verify token, WhatsApp tokens, Meta page tokens,
Telegram bot tokens) out of the environment and in an encrypted database store, manageable
by API, with a single active credential per channel kind. Only a master key lives in env.

## Requirements

### Requirement: Encrypted credential store
The system SHALL persist channel credentials in a `channel_credentials` table with the
secrets encrypted at rest using AES-256-GCM (random 12-byte IV and authentication tag per
row) under a master key from `CHANNEL_CREDENTIALS_KEY`. Each row has a `kind`
(`meta_app`, `whatsapp`, `meta_page`, `telegram`), a `label`, an `active` flag and the
encrypted secrets blob. A partial unique index SHALL enforce at most one `active` row per
`kind`. Plaintext secrets MUST NOT be written to the database or logs.

#### Scenario: Secret encrypted on write
- **WHEN** a credential is created with a secret value
- **THEN** the stored `secrets_encrypted` column is ciphertext that does not contain the
  plaintext, and reading the row back decrypts to the original value

#### Scenario: Single active per kind enforced
- **WHEN** a second credential of the same `kind` is activated while one is already active
- **THEN** the database rejects it via the partial unique index

#### Scenario: Wrong key fails closed
- **WHEN** the master key cannot decrypt a row (missing or incorrect key)
- **THEN** resolution treats the credential as not configured and logs an error without
  crashing

### Requirement: Active credential resolution with cache
The system SHALL expose a resolution service returning the decrypted secrets of the active
credential for a given `kind`, cached with a short TTL and invalidated on any credential
mutation. When no active credential exists (or no master key is set) it SHALL return an
absent result so the channel behaves as not configured, never throwing at startup.

#### Scenario: Resolves the active credential
- **WHEN** an active `whatsapp` credential exists and a sender requests it
- **THEN** the service returns its decrypted `access_token` and `phone_number_id`

#### Scenario: Absent credential disables the channel
- **WHEN** no active credential of a kind exists
- **THEN** the resolution returns absent and the consumer treats the channel as not
  configured

#### Scenario: Mutation invalidates the cache
- **WHEN** a credential's secrets are rotated via the API
- **THEN** the next resolution in the same process returns the new secrets without waiting
  for the TTL

### Requirement: Credential CRUD never returns secrets
The system SHALL expose `GET/POST/PATCH/DELETE /api/channel-credentials`. Listing and
detail return only metadata (`kind`, `label`, `active`, timestamps) plus a `configured`
boolean — never the secret value nor a mask derived from it. Create and update accept
secrets validated per `kind`; update without secrets changes only `label`/`active`.
Deleting a credential referenced by conversations SHALL respond 409 `RESOURCE_REFERENCED`.
Every mutation emits a `domain_event` with `actor='user'` and no secret in the payload.

#### Scenario: Listing hides secrets
- **WHEN** `GET /api/channel-credentials` is requested
- **THEN** each entry shows `kind`, `label`, `active` and `configured=true` but no secret
  value

#### Scenario: Create stores encrypted secrets
- **WHEN** `POST /api/channel-credentials` sends a `whatsapp` credential with token and
  phone number id
- **THEN** the row is persisted encrypted and a `channel_credential.created` event is
  appended without the secret

#### Scenario: Update rotates secrets
- **WHEN** `PATCH /api/channel-credentials/:id` sends new secrets
- **THEN** the stored ciphertext changes and subsequent resolutions use the new values

### Requirement: One-time migration from environment
On startup, when `CHANNEL_CREDENTIALS_KEY` is set and no credential row exists for a
`kind`, the system SHALL seed that credential from the legacy per-channel environment
variables if present, reading them directly from the process environment (they are no
longer part of the validated env schema). The seed MUST be idempotent and never overwrite
an existing row.

#### Scenario: Legacy env seeded once
- **WHEN** the backend starts with `CHANNEL_CREDENTIALS_KEY` set and legacy WhatsApp env
  vars present but no `whatsapp` credential row
- **THEN** an active `whatsapp` credential is created from those values

#### Scenario: Seed does not overwrite
- **WHEN** the backend restarts with a `whatsapp` credential already present
- **THEN** the existing row is left unchanged regardless of legacy env values
