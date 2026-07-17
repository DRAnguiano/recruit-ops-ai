# inbox-api

## ADDED Requirements

### Requirement: Conversation listing and detail
The system SHALL expose `GET /api/conversations` (paginated, ordered by `lastMessageAt`
descending, filterable by `status`, `channel`, `assignedAgentId` and `attentionMode`) and
`GET /api/conversations/:id` including the person (name, phone) and current assignment.

#### Scenario: Inbox listing
- **WHEN** `GET /api/conversations?status=open` is requested
- **THEN** open conversations are returned newest-activity-first with person name/phone,
  channel, attention mode and assigned agent

#### Scenario: Filter by agent
- **WHEN** the listing is filtered by `assignedAgentId`
- **THEN** only conversations assigned to that agent are returned

### Requirement: Message listing per conversation
The system SHALL expose `GET /api/conversations/:id/messages` paginated over stable
`sentAt` ordering, each message carrying direction, type, body, sender and media status.

#### Scenario: Chat viewer loads messages
- **WHEN** the messages of a conversation are requested
- **THEN** they are returned in chronological order with `type` and, for media messages,
  the media `status` (`pending|stored|failed`)

### Requirement: Stored media download
The system SHALL expose `GET /api/messages/:id/media` streaming the stored binary with
the persisted `Content-Type`. Requests for messages whose media is not `stored` MUST
respond 404 with a typed domain error; filesystem paths are never exposed.

#### Scenario: Play a voice note
- **WHEN** the media endpoint is requested for a message with `media.status=stored`
- **THEN** the binary streams with the stored mime type

#### Scenario: Media still pending
- **WHEN** the media endpoint is requested for a message with `media.status=pending`
- **THEN** the API responds 404 with a domain error code indicating media not available

### Requirement: Conversation assignment
The system SHALL expose an endpoint to assign or unassign an agent on a conversation
(`assignedAgentId` nullable). The agent MUST exist and be active; the mutation emits
`conversation.assigned` with `actor='user'`.

#### Scenario: Assign agent
- **WHEN** a conversation is assigned to an existing active agent
- **THEN** `assignedAgentId` persists and a `conversation.assigned` event is appended with
  `actor='user'`

#### Scenario: Unknown agent rejected
- **WHEN** the assignment references a non-existent agent id
- **THEN** the API responds with a typed domain error and nothing changes

### Requirement: Attention mode toggle
The system SHALL expose an endpoint to set `attentionMode` to `human` or `bot` per
conversation, emitting `conversation.attention_mode_changed`. Values outside the pair
MUST be rejected. (The atomic human-takeover lock semantics arrive with `add-bot-gateway`.)

#### Scenario: Toggle to bot
- **WHEN** the attention mode of an open conversation is set to `bot`
- **THEN** the conversation persists `attentionMode=bot` and the change event is appended

### Requirement: Manual conversation close
The system SHALL expose an endpoint to close an open conversation (`status=closed`,
`closedAt` set, `conversation.closed` emitted with `actor='user'`). Closing an already
closed conversation MUST be rejected with a typed domain error. A later inbound message
still opens a new conversation per the existing lifecycle.

#### Scenario: Close from UI
- **WHEN** an open conversation is closed via the API
- **THEN** it persists `status=closed` with `closedAt` and history intact
