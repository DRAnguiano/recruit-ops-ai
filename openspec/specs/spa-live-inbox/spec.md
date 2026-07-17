# spa-live-inbox

## Requirements

### Requirement: Chat viewer shows real conversations
Opening a lead's chat SHALL fetch the person's conversations
(`GET /api/conversations?personId=`) and their messages (all pages), rendering direction,
body and timestamps; media messages (audio/image/document/video) render playable/viewable
content streamed from `GET /api/messages/:id/media`.

#### Scenario: Audio message playable
- **WHEN** a conversation containing a stored audio message is opened
- **THEN** the viewer renders an audio player sourced from the media endpoint

### Requirement: Composer respects the channel window
The chat viewer SHALL offer free-form sending only when the conversation detail reports
`canSendFreeform=true`; otherwise it explains the expired window. Sends go through
`POST /api/conversations/:id/messages` and the delivered message appears in the thread
with its delivery state.

#### Scenario: Send inside window
- **WHEN** an agent sends text in an open-window WhatsApp conversation
- **THEN** the message posts, appears in the thread and its delivery state updates

### Requirement: Live updates over WebSocket
The SPA SHALL keep a `/ws` connection with automatic reconnection (exponential backoff);
`message.received`, `conversation.*` and `lead.*` events trigger a debounced refetch of
leads and, when the affected conversation is open in the viewer, of its messages.

#### Scenario: Inbound message appears without reload
- **WHEN** a webhook ingests a new message while the SPA is open
- **THEN** the lead list reflects it within seconds without a manual reload
