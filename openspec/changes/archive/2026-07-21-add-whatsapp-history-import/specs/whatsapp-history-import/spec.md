# whatsapp-history-import (delta)

## ADDED Requirements

### Requirement: Historical WhatsApp ingestion endpoint
The system SHALL expose `POST /api/import/whatsapp-history` accepting a batch of normalized
inbound messages (validated with zod: `channel`, `externalMessageId`, `externalUserId`,
`sentAt`, `body`, optional `senderName`/`phoneE164`/`referral`) plus an `agent` label, and
ingest them through the existing `MessageIngestionService` — creating person, channel identity,
conversation and lead. Ingestion MUST be idempotent by `(channel, external_message_id)`:
re-posting the same batch creates no duplicate rows or events. Historical ingestion MUST NOT
trigger the bot gateway nor any outbound send.

#### Scenario: Batch creates people, conversations and leads
- **WHEN** a batch of historical WhatsApp messages for a new candidate phone is posted
- **THEN** a person (deduped by phone), a `whatsapp` conversation and a lead are created with the
  messages' real timestamps, and the response reports counts (messages, leads created)

#### Scenario: Re-import is idempotent
- **WHEN** the same batch is posted twice
- **THEN** the second post creates no new message, conversation or lead rows

#### Scenario: Historical ingestion never triggers the bot
- **WHEN** a historical batch is ingested
- **THEN** no `bot.notify` job is enqueued and no outbound message is created, regardless of content

### Requirement: Client-side parsing of the nested export
The «Cargar datos» view SHALL accept a WhatsApp export `.zip` (nested: one zip per recruiter,
one zip per conversation, one `.txt` each), decompress it in the browser with `jszip`, and for
each conversation reuse `parseWhatsAppChat` to produce the candidate's inbound messages. The
owning recruiter SHALL be taken from the recruiter folder name, normalizing the `Dulce`→`Damaris`
alias, and the resulting lead SHALL be assigned to that agent (seeded if missing).

#### Scenario: Nested zip parsed to per-conversation batches
- **WHEN** a recruiter export zip is selected
- **THEN** each inner conversation is parsed and posted, and a summary reports conversations
  processed, leads created, duplicates skipped, and chats without a candidate message

#### Scenario: Chat with no candidate message is skipped
- **WHEN** a conversation contains only agent messages (parser returns null)
- **THEN** it is counted as skipped, not as an error, and no lead is created

### Requirement: Origin without invented attribution
Historical ingestion SHALL detect origin `Facebook` vs `orgánico` using the existing heuristic,
but MUST NOT attribute a lead to a specific campaign without an `ad_id`. Facebook-detected leads
are marked as paid-origin without a campaign link.

#### Scenario: Facebook origin without ad id is not attributed to a campaign
- **WHEN** a chat's first message matches the Facebook-ad heuristic but carries no `ad_id`
- **THEN** the lead records a Facebook/paid origin and no `campaign_id`
