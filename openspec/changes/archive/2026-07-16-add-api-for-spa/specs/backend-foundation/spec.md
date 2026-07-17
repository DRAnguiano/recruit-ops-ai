# backend-foundation (delta)

## ADDED Requirements

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
