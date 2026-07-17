# whatsapp-window-policy (delta)

## ADDED Requirements

### Requirement: 24-hour window enforced by the backend
For WhatsApp conversations the system SHALL compute the customer-service window as a pure
function of the last inbound message timestamp: free-form text is allowed only within 24
hours of it. Outside the window (or with no inbound message at all) free-form sends MUST be
rejected with 409 `WINDOW_EXPIRED`, and only approved templates may be sent. Non-WhatsApp
channels have no window. The window engine SHALL have unit tests.

#### Scenario: Free-form inside window
- **WHEN** the last inbound message arrived 2 hours ago
- **THEN** free-form text is accepted

#### Scenario: Free-form outside window rejected
- **WHEN** the last inbound message arrived 25 hours ago
- **THEN** the API responds 409 `WINDOW_EXPIRED` and suggests using a template, and the
  same conversation still accepts a template send

### Requirement: Window state exposed to the UI
`GET /api/conversations/:id` SHALL include `canSendFreeform` and `windowExpiresAt`
(nullable) so the UI can offer the right composer without re-implementing the policy.

#### Scenario: Detail exposes window
- **WHEN** a WhatsApp conversation detail is requested within the window
- **THEN** `canSendFreeform=true` and `windowExpiresAt` equals last inbound + 24h
