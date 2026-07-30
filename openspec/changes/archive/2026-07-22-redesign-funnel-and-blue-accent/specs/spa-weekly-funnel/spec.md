# spa-weekly-funnel (delta)

## ADDED Requirements

### Requirement: Weekly funnel shows recruitment stages with drop-off
The Funnel tab SHALL render a stage funnel for the selected period showing, in order, the count at
each recruitment stage and the drop-off between stages, using only signals that exist in the data
model (leads ingested, real conversations, replied-by-recruiter, hired). It SHALL NOT invent stages
that have no backing field.

#### Scenario: Funnel renders real stages
- **WHEN** the Funnel tab renders with leads in the period
- **THEN** it shows stages Leads → Conversaciones reales → Contestados → Contratados, each with its
  count, its share of the top-of-funnel total, and the drop-off from the previous stage

#### Scenario: Funnel is faithful to missing data
- **WHEN** a stage has zero because its underlying signal is not yet computed (e.g. `responded`)
- **THEN** the funnel shows that stage at zero rather than hiding it or filling a fabricated value

#### Scenario: Empty period
- **WHEN** there are no leads in the selected period
- **THEN** the funnel shows an empty state instead of an all-zero chart

### Requirement: Summary KPI cards accompany the funnel
The Funnel tab SHALL keep the summary KPI cards above the funnel as an at-a-glance strip.

#### Scenario: KPIs present above funnel
- **WHEN** the Funnel tab renders
- **THEN** the summary KPI cards remain visible above the stage funnel
