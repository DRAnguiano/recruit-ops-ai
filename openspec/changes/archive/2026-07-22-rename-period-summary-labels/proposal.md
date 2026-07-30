## Why

El usuario pide un vocabulario de negocio más claro en la vista de resumen: hablar de «candidatos»
y «operadores» en vez de términos técnicos de embudo/marketing. Es solo copy (texto de UI), sin
cambio de lógica, datos ni métricas.

## What Changes

- Ítem de menú y vista: **«Funnel de la Semana» → «Resumen del periodo»**.
- Título del embudo: **«Embudo de Reclutamiento del Periodo» → «Avance del reclutamiento»**.
- KPI cards:
  - «Leads Facebook» → **«Candidatos recibidos»**
  - «Tasa de Respuesta» → **«Candidatos atendidos»**
  - «Conversaciones Reales» → **«Conversaciones iniciadas»**
  - «Ingresos (Contratos)» → **«Operadores contratados»**
  - «Conversión Lead → Alta» → **«Porcentaje de contratación»**
- Para coherencia, las etiquetas de las etapas del embudo se alinean al mismo vocabulario
  (Candidatos recibidos · Conversaciones iniciadas · Candidatos atendidos · Operadores contratados).

Fuera de alcance: valores, cálculos, orden de etapas, colores.

## Capabilities

### Modified Capabilities

- `spa-weekly-funnel`: la vista de resumen usa el vocabulario de negocio (candidatos/operadores);
  no cambia ninguna métrica ni etapa, solo el texto.

## Impact

- **Frontend**: `src/components/Sidebar.tsx`, `src/App.tsx` (KPI titles + stage labels),
  `src/components/WeeklyFunnel.tsx`. **Sin backend, sin migración, sin deps.**
