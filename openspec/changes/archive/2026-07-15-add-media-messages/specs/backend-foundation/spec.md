# backend-foundation (delta)

## ADDED Requirements

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
