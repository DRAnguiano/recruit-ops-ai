# operational-capacity (delta)

## ADDED Requirements

### Requirement: Circuit capacity snapshot model and ingestion
The system SHALL persist a per-circuit capacity snapshot in `circuit_capacity` (unique by
`circuit`): `units`, `unitsInMaintenance`, `unitsActive`, `hcAuthorized`, `hcReal`, `deficit`,
`snapshotDate`. It SHALL expose `POST /api/import/hc-capacity` accepting `{snapshotDate,
circuits[]}` and upserting by `circuit`. Re-posting the same snapshot leaves the table unchanged
(idempotent). `deficit` is derived as `hcAuthorized − hcReal` when the source DIF is absent.

#### Scenario: Snapshot upserted per circuit
- **WHEN** a snapshot with 9 circuits is posted
- **THEN** each circuit has one row with its units, authorized/real HC and deficit, and the
  response reports created/updated counts

#### Scenario: Re-import is idempotent
- **WHEN** the same snapshot is posted twice
- **THEN** the second post creates no new rows and only updates in place

### Requirement: Client takes the latest snapshot from HC 2026
The «Cargar datos» view SHALL parse the «HC 2026» sheet (which holds several dated blocks), detect
each block by its `Fecha` row and `CIRCUITO` header, and take the block with the **latest date**.
From it, the per-circuit rows are extracted (ignoring the `TOTAL` row) and posted.

#### Scenario: Latest block wins
- **WHEN** the sheet contains blocks dated 10/06 through 17/07
- **THEN** only the 17/07 block's circuits are imported

#### Scenario: Total row is ignored
- **WHEN** a block ends with a `TOTAL` row
- **THEN** that row is not imported as a circuit

### Requirement: Capacity-by-circuit section in the Capacity view
The Capacity view SHALL show, in addition to the existing per-company deficit, a per-circuit
section reading `GET /api/circuit-capacity`: authorized vs. real HC and deficit per circuit,
ordered/highlighted by largest deficit.

#### Scenario: Circuits with deficit are highlighted
- **WHEN** a circuit's `hcReal` is below its `hcAuthorized`
- **THEN** it shows a positive deficit and is visually highlighted as needing recruitment
