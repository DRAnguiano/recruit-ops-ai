# message-templates

## Requirements

### Requirement: Template catalog as data
The system SHALL store approved message templates in a `message_templates` table (`name`,
`language`, `channel`, `body` with `{{n}}` placeholders, `variablesCount`, `status`,
`active`) with CRUD under `/api/message-templates` following the catalog conventions
(typed errors, `actor='user'` audit events). Templates are configuration, never code.

#### Scenario: Create template
- **WHEN** `POST /api/message-templates` sends name, language, channel and body
- **THEN** the template persists and lists via GET

### Requirement: Template send renders body and validates variables
Sending `{ templateId, variables }` SHALL validate the template is active and variable
count matches, persist the outbound message with the rendered body (placeholders
substituted) for a readable inbox history, and deliver it as a Cloud API `template`
payload.

#### Scenario: Variable count mismatch
- **WHEN** a template with 2 placeholders is sent with 1 variable
- **THEN** the API responds 400 `VALIDATION_ERROR` and nothing is persisted

#### Scenario: Template send outside window succeeds
- **WHEN** the 24h window is closed and an approved template is sent with matching variables
- **THEN** the message persists with the rendered body and is delivered as template payload
