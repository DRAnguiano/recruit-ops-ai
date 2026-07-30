# spa-manual-attribution (delta)

## ADDED Requirements

### Requirement: Manual attribution panel uses clear, consistent vocabulary
The manual attribution panel SHALL let the user link a WhatsApp candidate to an already-hired
operator when their phones do not match, using one term per entity («candidato», «operador
contratado») and naming the action «vincular» (not «atribución»). Only labels and messages change;
the linking behavior is unchanged.

#### Scenario: Consistent labels
- **WHEN** the manual attribution panel renders
- **THEN** the candidate selector reads «Candidato de WhatsApp», the operator selector reads
  «Operador contratado», and the submit button reads «Vincular candidato»

#### Scenario: Action-oriented messages
- **WHEN** the user completes or fails a link
- **THEN** status messages refer to «candidato» and «vincular», not «lead»/«prospecto»/«atribución»
