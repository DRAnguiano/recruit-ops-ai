# inbox-api (delta)

## ADDED Requirements

### Requirement: Send endpoint in the inbox API
The inbox API SHALL expose `POST /api/conversations/:id/messages` accepting either
`{ body }` (free-form) or `{ templateId, variables }` (template), validated with zod,
returning the persisted outbound message with its delivery state. Closed conversations
reject sends with 409 `CONVERSATION_CLOSED`.

#### Scenario: Send on closed conversation rejected
- **WHEN** a send targets a conversation with `status='closed'`
- **THEN** the API responds 409 `CONVERSATION_CLOSED` and nothing is persisted

## MODIFIED Requirements

### Requirement: Conversation detail exposes window state
`GET /api/conversations/:id` SHALL additionally include `canSendFreeform` (boolean) and
`windowExpiresAt` (ISO timestamp or null) derived from the channel window policy.

#### Scenario: Telegram conversation always freeform
- **WHEN** the detail of a Telegram conversation is requested
- **THEN** `canSendFreeform=true` and `windowExpiresAt=null`
