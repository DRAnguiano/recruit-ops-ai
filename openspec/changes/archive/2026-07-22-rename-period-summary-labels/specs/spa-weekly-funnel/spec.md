# spa-weekly-funnel (delta)

## MODIFIED Requirements

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
