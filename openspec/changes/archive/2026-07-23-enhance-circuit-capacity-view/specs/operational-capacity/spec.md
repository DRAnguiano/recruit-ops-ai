# operational-capacity (delta)

## MODIFIED Requirements

### Requirement: Circuit capacity snapshot model and ingestion
The system SHALL persist a per-circuit capacity snapshot in `circuit_capacity` (unique by
`circuit`): `units`, `unitsInMaintenance`, `unitsActive`, `hcAuthorized`, `hcReal`, `deficit`,
`sourceDeficit`, `snapshotDate`. It SHALL expose `POST /api/import/hc-capacity` accepting
`{snapshotDate, circuits[]}` and upserting by `circuit`. Re-posting the same snapshot leaves the
table unchanged (idempotent). `deficit` is always derived as `hcAuthorized − hcReal`.
`sourceDeficit` stores the report's own DIF column value when present (null otherwise) as a
reference value, never used to compute `deficit`.

#### Scenario: Snapshot upserted per circuit
- **WHEN** a snapshot with 9 circuits is posted
- **THEN** each circuit has one row with its units, authorized/real HC, calculated deficit, and the
  response reports created/updated counts

#### Scenario: Re-import is idempotent
- **WHEN** the same snapshot is posted twice
- **THEN** the second post creates no new rows and only updates in place

#### Scenario: Source DIF is captured when present
- **WHEN** the imported report includes a DIF column for a circuit
- **THEN** that raw value is stored as `sourceDeficit`, separate from the calculated `deficit`

#### Scenario: Source DIF absent leaves the reference null
- **WHEN** the imported report has no DIF column
- **THEN** `sourceDeficit` is null for that circuit

### Requirement: Client takes the latest snapshot from HC 2026
The «Cargar datos» view SHALL parse the «HC 2026» sheet (which holds several dated blocks), detect
each block by its `Fecha` row and `CIRCUITO` header, and take the block with the **latest date**.
From it, the per-circuit rows are extracted (ignoring the `TOTAL` row) and posted, including the
DIF column when present.

#### Scenario: Latest block wins
- **WHEN** the sheet contains blocks dated 10/06 through 17/07
- **THEN** only the 17/07 block's circuits are imported

#### Scenario: Total row is ignored
- **WHEN** a block ends with a `TOTAL` row
- **THEN** that row is not imported as a circuit

### Requirement: Capacity-by-circuit section in the Capacity view
The Capacity view SHALL show, in addition to the existing per-company deficit, a per-circuit
section reading `GET /api/circuit-capacity`: authorized vs. real HC, calculated deficit, each
circuit's **participation** (share of the total deficit across circuits with a positive deficit),
and a discrepancy indicator when `sourceDeficit` differs from the calculated `deficit` — without
hardcoding which circuit it applies to.

#### Scenario: Circuits with deficit are highlighted
- **WHEN** a circuit's `hcReal` is below its `hcAuthorized`
- **THEN** it shows a positive deficit and is visually highlighted as needing recruitment

#### Scenario: Participation share shown
- **WHEN** the circuit list renders
- **THEN** each circuit with a positive deficit shows its % share of the total deficit; circuits
  with no deficit show no participation

#### Scenario: Discrepancy with the source is flagged
- **WHEN** a circuit's `sourceDeficit` is not null and differs from its calculated `deficit`
- **THEN** that row shows an indicator noting the source reports a different value, for human
  validation
