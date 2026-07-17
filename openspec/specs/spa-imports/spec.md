# spa-imports

## Requirements

### Requirement: Surviving imports use bulk endpoints
The import module SHALL keep parsing operator Excel and campaign CSV files in the browser
but persist them via `POST /api/operators/bulk` and `POST /api/campaigns/bulk`, showing
the `{created, updated}` result. WhatsApp ZIP import, JSON backup/restore and
local-database wipe MUST be removed, replaced by a notice that chats now arrive via
webhooks.

#### Scenario: Operator Excel import
- **WHEN** an operator Excel file is imported twice
- **THEN** the first run reports creations, the second only updates, and the operators
  view shows API data

#### Scenario: Chat ZIP import removed
- **WHEN** the import view renders
- **THEN** no WhatsApp ZIP upload exists and the webhook notice is shown
