# media-ingestion

## ADDED Requirements

### Requirement: Non-text messages are persisted
Inbound audio, voice, image, document and video messages SHALL be persisted as message
rows with their `type`, the caption (if any) as `body`, and a `media` reference
(`externalId`, `mimeType`, `filename`, `status=pending`). They MUST flow through the same
idempotent ingestion and lead pipeline as text.

#### Scenario: WhatsApp voice note persisted
- **WHEN** a WhatsApp audio/voice message arrives
- **THEN** a message row exists with `type=audio`, media `externalId` and `status=pending`

#### Scenario: Image with caption classifies the lead
- **WHEN** an image arrives with caption "quiero la vacante de tráiler"
- **THEN** the caption is stored as `body` and the lead pipeline classifies from it

#### Scenario: Unsupported types still ACK
- **WHEN** a sticker/reaction/location arrives
- **THEN** the webhook ACKs 200 and no message row is created
