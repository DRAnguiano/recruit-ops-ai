# backend-foundation

## ADDED Requirements

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
