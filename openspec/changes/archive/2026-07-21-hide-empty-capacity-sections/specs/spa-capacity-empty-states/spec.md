# spa-capacity-empty-states (delta)

## ADDED Requirements

### Requirement: Capacity sections hide when their data is empty
The Capacity view SHALL render the per-company fleet deficit section only when `fleet` has rows,
and the monthly-goals progress section only when there is monthly-goal progress data. Sections with
no data are not shown (no zero-filled tables or empty bars).

#### Scenario: Fleet section hidden without fleet data
- **WHEN** the Capacity view renders and `fleet` is empty
- **THEN** the per-company deficit KPIs and fleet chart are not shown

#### Scenario: Goals section hidden without monthly goals
- **WHEN** there are no monthly goals
- **THEN** the «Avance contra Metas Mensuales» section is not shown

#### Scenario: Circuit section still shows with its data
- **WHEN** `circuit_capacity` has rows but `fleet`/`goals` are empty
- **THEN** only the per-circuit capacity section renders

### Requirement: Empty-state when the whole tab has no data
When none of the Capacity sections has data (no fleet, no monthly goals, no circuit capacity), the
view SHALL show a single explanatory empty-state naming what to load, instead of a blank screen —
distinguishing «no data» from «real zero».

#### Scenario: Whole-tab empty-state
- **WHEN** fleet, monthly goals and circuit capacity are all empty
- **THEN** a message explains loading the HC 2026 report, the operators directory, or defining goals
