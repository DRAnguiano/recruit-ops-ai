# whatsapp-window-policy

## Requirements

### Requirement: 24-hour window enforced by the backend
For WhatsApp, Messenger and Instagram conversations the system SHALL compute the
customer-service window as a pure function of the last inbound message timestamp:
free-form text is allowed only within 24 hours of it. Outside the window (or with no
inbound message at all) free-form sends MUST be rejected with 409 `WINDOW_EXPIRED`. On
WhatsApp, approved templates remain the only out-of-window alternative; Messenger and
Instagram have no template fallback. Telegram has no window. The window engine SHALL have
unit tests.

#### Scenario: Free-form inside window
- **WHEN** the last inbound message arrived 2 hours ago
- **THEN** free-form text is accepted

#### Scenario: Free-form outside window rejected
- **WHEN** the last inbound message arrived 25 hours ago on WhatsApp
- **THEN** the API responds 409 `WINDOW_EXPIRED` and suggests using a template, and the
  same conversation still accepts a template send

#### Scenario: Messenger outside window has no fallback
- **WHEN** the last inbound message on a messenger conversation arrived 25 hours ago
- **THEN** free-form responds 409 `WINDOW_EXPIRED` and template sends respond 409
  `TEMPLATES_NOT_SUPPORTED`

### Requirement: Window state exposed to the UI
`GET /api/conversations/:id` SHALL include `canSendFreeform` and `windowExpiresAt`
(nullable) for all windowed channels (WhatsApp, Messenger, Instagram) so the UI can offer
the right composer without re-implementing the policy.

#### Scenario: Detail exposes window
- **WHEN** a WhatsApp conversation detail is requested within the window
- **THEN** `canSendFreeform=true` and `windowExpiresAt` equals last inbound + 24h

#### Scenario: Instagram detail exposes window
- **WHEN** an instagram conversation detail is requested 25 hours after the last inbound
- **THEN** `canSendFreeform=false`
