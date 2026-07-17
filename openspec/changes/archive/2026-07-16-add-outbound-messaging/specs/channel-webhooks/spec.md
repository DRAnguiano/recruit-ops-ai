# channel-webhooks (delta)

## MODIFIED Requirements

### Requirement: WhatsApp statuses are processed, not discarded
The Meta webhook SHALL keep ACKing every authenticated payload, but `statuses` entries for
WhatsApp MUST now be enqueued and processed as delivery updates instead of being dropped.
Non-message, non-status payloads (edits, reactions) keep the ACK-and-ignore behavior.

#### Scenario: Status payload enqueued
- **WHEN** an authenticated webhook arrives containing only `statuses`
- **THEN** it is ACKed with 200 and a delivery-update job is enqueued (no message row is
  created)
