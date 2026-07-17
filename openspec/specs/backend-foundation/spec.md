# backend-foundation

## Requirements

### Requirement: NestJS modular monolith skeleton
The system SHALL provide a NestJS backend under `server/` organized as a modular monolith
with one module per domain, where domain modules MUST NOT import internals of other domain
modules (only their public interfaces).

#### Scenario: Application boots
- **WHEN** the developer runs the backend dev script with valid environment variables
- **THEN** the NestJS application starts and listens on the configured port

#### Scenario: Health check responds
- **WHEN** a GET request is made to `/health`
- **THEN** the API responds 200 with status of the process, database and Redis connections

### Requirement: Environment validation with zod
The system SHALL validate all environment variables against a zod schema before the
application is created, and MUST refuse to start when validation fails.

#### Scenario: Missing required variable
- **WHEN** the process starts without a required variable (e.g. `DATABASE_URL`)
- **THEN** the process exits with a non-zero code and a readable message naming the invalid
  or missing variables

#### Scenario: Variables documented
- **WHEN** a new environment variable is added to the zod schema
- **THEN** it MUST also appear in `.env.example` with a sample value

### Requirement: Typed domain errors
The system SHALL define a typed domain error class (code + message) and all domain-level
failures MUST be raised through it; throwing plain strings or generic `Error` for domain
failures is not allowed.

#### Scenario: Domain error serialization
- **WHEN** a domain error reaches the HTTP layer
- **THEN** the response contains the stable error code and message, without a stack trace

### Requirement: Reproducible local environment
The system SHALL provide a `docker-compose.yml` that starts PostgreSQL and Redis for local
development with a single command.

#### Scenario: Fresh clone startup
- **WHEN** a developer clones the repo, runs docker-compose up, copies `.env.example` and
  runs the migration and dev scripts
- **THEN** the backend starts against the local containers without further manual setup



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

### Requirement: Media and API-base configuration variables
The environment schema SHALL accept optional `WHATSAPP_ACCESS_TOKEN`,
`TELEGRAM_BOT_TOKEN` and `MEDIA_STORAGE_DIR` (default `./storage/media`), plus
`GRAPH_API_BASE_URL` and `TELEGRAM_API_BASE_URL` with the official defaults. Their
absence MUST NOT prevent startup.

#### Scenario: Startup without media tokens
- **WHEN** the backend starts without media tokens
- **THEN** it boots normally and media downloads remain `pending`

#### Scenario: Variables documented
- **WHEN** the media variables are added to the zod schema
- **THEN** they appear in `.env.example` with explanatory comments

### Requirement: CORS configuration variable
The environment schema SHALL accept an optional `CORS_ALLOWED_ORIGINS` (comma-separated
origins) with a development default covering the local Vite dev server. Its absence MUST
NOT prevent startup.

#### Scenario: Startup without CORS variable
- **WHEN** the backend starts without `CORS_ALLOWED_ORIGINS`
- **THEN** it boots normally allowing only the development default origin

#### Scenario: Variable documented
- **WHEN** `CORS_ALLOWED_ORIGINS` is added to the zod schema
- **THEN** it appears in `.env.example` with an explanatory comment
