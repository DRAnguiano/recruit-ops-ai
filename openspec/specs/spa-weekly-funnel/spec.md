# spa-weekly-funnel

## Purpose

La pestaña Funnel muestra un embudo por etapas del reclutamiento del periodo (de lead ingresado a
contratación), con la caída entre etapas, para que el operador vea de un vistazo dónde se pierde el
flujo. El embudo se deriva solo de señales que existen en el modelo, sin inventar etapas.

## Requirements

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
The summary view SHALL keep the summary KPI cards above the funnel as an at-a-glance strip, using
business-oriented labels: «Candidatos recibidos», «Candidatos atendidos», «Conversaciones
iniciadas», «Operadores contratados», «Porcentaje de contratación». The stage funnel and its title
(«Avance del reclutamiento») SHALL use the same vocabulary; only labels change, not values or stages.

#### Scenario: KPIs present above funnel with business labels
- **WHEN** the summary view renders
- **THEN** the summary KPI cards remain visible above the stage funnel with the business labels

#### Scenario: Stage labels match the KPI vocabulary
- **WHEN** the stage funnel renders
- **THEN** its stages read Candidatos recibidos → Conversaciones iniciadas → Candidatos atendidos →
  Operadores contratados, with the same counts and order as before
