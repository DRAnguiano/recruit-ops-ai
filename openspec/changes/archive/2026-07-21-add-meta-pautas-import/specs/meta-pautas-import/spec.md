# meta-pautas-import (delta)

## ADDED Requirements

### Requirement: Meta pautas ingestion endpoint
The system SHALL expose `POST /api/import/meta-pautas` accepting a batch of campaigns
(`agent`, `name`, `startDate`, `endDate`, `spend`, `leadsReported`), resolving/seeding the
agent by name, deriving the ISO week from `startDate`, and upserting into `campaigns`
(`source='csv'`, `currency='USD'`, `targetAgentId` set to the resolved agent). Upsert MUST be
idempotent by `(name, isoWeek)`: re-posting the same batch creates no duplicate campaigns.

#### Scenario: Batch creates campaigns linked to their agent
- **WHEN** a batch of Meta pautas for agent "Gladis" is posted
- **THEN** each campaign is upserted with `targetAgentId` = Gladis's agent id, its date range,
  spend in USD and leads reported, and the response reports created/updated counts

#### Scenario: Missing agent is seeded
- **WHEN** a batch references an agent that does not exist yet (e.g. Adriana)
- **THEN** the agent is created and the campaigns are linked to it

#### Scenario: Re-import is idempotent
- **WHEN** the same batch is posted twice
- **THEN** the second post creates no new campaign rows

### Requirement: Encoding-tolerant multi-sheet parsing
The «Cargar datos» view SHALL accept the Meta Ads `.xlsx` export (one sheet per recruiter),
parse it with `xlsx`, resolve columns by normalized substring match (tolerating mojibake
headers like `campaÃ±a` and variable column order), and derive the owning agent from the sheet
name (`Redes-Grupotm-<Name>`), applying the `Dulce→Damaris` alias. Rows missing a campaign name
are reported as errors, never invented.

#### Scenario: Sheets with different headers map the same
- **WHEN** one sheet uses «Nombre del anuncio» and another «Nombre de la campaÃ±a»
- **THEN** both resolve to the campaign `name` and import identically

#### Scenario: Leads reported uses message contacts, not Results
- **WHEN** a row has both a large «Resultados» value and a «Contactos de mensajes totales» value
- **THEN** `leadsReported` is set from the message-contacts column, not from «Resultados»

### Requirement: Campaigns view crosses Meta pautas with real leads
Once pautas are loaded, the Campaigns view SHALL show, per campaign, the spend and Meta-reported
leads against the real WhatsApp leads of that campaign's agent, and the cost per lead — using the
existing agent↔lead cross without UI changes.

#### Scenario: Cost per lead crosses Meta spend with real WhatsApp leads
- **WHEN** a campaign for agent "Gladis" has spend and the agent has real WhatsApp leads
- **THEN** the view shows both Meta-reported leads and the real WhatsApp leads count for that agent
