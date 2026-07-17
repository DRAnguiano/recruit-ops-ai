# bot-actions (delta)

## ADDED Requirements

### Requirement: Closed action catalog endpoint
The system SHALL expose `POST /bot/v1/actions` authenticated by HMAC (`X-Bot-Signature`,
403 without/with invalid signature or when unconfigured), accepting
`{ contractVersion: 1, actions: [...] }` (max 5) where each action is exactly one of
`send_message`, `extract_data`, `request_handoff`. Unknown actions or malformed payloads
respond 400. Every executed action emits its domain event with `actor='bot'`. The
response reports per-action results `{action, ok, error?}`.

#### Scenario: Unknown action rejected
- **WHEN** the bot posts an action type outside the catalog
- **THEN** the API responds 400 and nothing executes

### Requirement: Bot send_message goes through the outbound pipeline
`send_message {conversationId, body}` SHALL reuse the existing outbound pipeline
(persist-then-send, channel senders, 24h window) with `actor='bot'` on `message.sent`,
and additionally require the conversation to be in bot mode (see attention-lock).

#### Scenario: Bot replies within window
- **WHEN** the bot sends text to an open bot-mode WhatsApp conversation within the window
- **THEN** the message persists, is delivered by the worker, and `message.sent` carries
  `actor='bot'`

#### Scenario: Window expired for bot
- **WHEN** the bot sends free-form text outside the 24h window
- **THEN** the action result is `WINDOW_EXPIRED` and nothing is sent

### Requirement: extract_data requires verifiable evidence
`extract_data {conversationId, fields}` SHALL validate every field's evidence: the
`messageId` MUST belong to the conversation and, for text messages, the `quote` MUST be a
substring of that message's body (media messages accept an empty quote — the binary is
the evidence). Valid extractions persist as a `lead.data_extracted` event
(`actor='bot'`) and MUST NOT mutate lead fields or statuses.

#### Scenario: Fabricated evidence rejected
- **WHEN** a field's quote does not appear in the referenced message body
- **THEN** that action fails with a typed error and no event is appended

#### Scenario: Valid extraction audited
- **WHEN** the bot extracts `{key: 'experiencia_anios', value: '5', evidence: {...}}` with
  a real quote
- **THEN** `lead.data_extracted` is appended with the fields and the lead row is unchanged

### Requirement: request_handoff switches to human
`request_handoff {conversationId, reason}` SHALL set `attentionMode='human'` and emit
`conversation.attention_mode_changed` (`actor='bot'`, payload with reason), visible live
over the WebSocket.

#### Scenario: Handoff on demand
- **WHEN** the bot requests handoff with reason "candidato molesto"
- **THEN** the conversation switches to human and the event reaches WS clients
