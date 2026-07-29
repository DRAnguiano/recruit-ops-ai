## Why

Dos correcciones básicas identificadas en el diagnóstico de arquitectura: el `<title>` de la
pestaña del navegador sigue diciendo «My Google AI Studio App» (el único lugar donde ese
nombre sobrevive; el resto del proyecto ya es «Torre de Control — Reclutamiento Transmontes»
/ «Transmontes Capital Humano»), y el horario laboral sembrado por defecto es 07:45–17:10 en
vez del oficial 07:30–17:30, lo que ya sesgó las métricas de `inWorkHours`/`arrivalHour`/
`arrivalDay` de los 311 leads recién importados (`add-whatsapp-history-import`).

## What Changes

- **Título de la app**: `index.html` pasa a `<title>Transmontes Capital Humano</title>`.
  Texto estático del `<title>`, no un dato de negocio configurable — no aplica la regla de
  catálogos configurables (esa regla es para reglas de negocio: score, horarios, catálogos).
- **Horario oficial corregido**: el `work_schedule` sembrado (`name='default'`) pasa de
  `07:45–17:10` a `07:30–17:30`; se corrige también el valor de respaldo hardcodeado en la SPA
  (`src/App.tsx`, usado solo si el backend no responde).
- **Recalculo de métricas históricas**: nueva capacidad
  `POST /api/leads/recalculate-schedule-metrics` que recorre los leads con `firstMessageAt` y
  recalcula `inWorkHours`/`arrivalHour`/`arrivalDay` contra el `work_schedule` vigente —
  reutilizable cada vez que el horario cambie, no solo para esta corrección puntual. Se ejecuta
  una vez contra los 311 leads importados como parte de la verificación de este change.
- **Hallazgo documentado, fuera de alcance**: `firstResponseMinutesNatural`/
  `firstResponseMinutesWork` existen como columnas pero el backend nunca las calcula (siempre
  `null`) — es un gap preexistente, no introducido por este change ni por la importación de
  historial. Se deja anotado en `project.md` como candidato a change futuro; no se resuelve aquí
  para no mezclar una corrección de dato con una funcionalidad nueva.

## Capabilities

### New Capabilities

- `schedule-metrics-recalculation`: recalculo bajo demanda de las métricas de horario hábil
  (`inWorkHours`, `arrivalHour`, `arrivalDay`) de los leads existentes contra el
  `work_schedule` vigente, para cuando el horario oficial cambie.

### Modified Capabilities

<!-- Ninguna: no cambia el contrato de creación de leads (el pipeline sigue calculando estos
     campos igual al ingerir); solo se agrega la vía de recalculo posterior. -->

## Impact

- **Datos**: migración que corrige el `work_schedule` sembrado (solo si sigue en el valor
  incorrecto — no pisa una personalización manual ya hecha); sin cambio de esquema.
- **Backend**: `LeadsService`/`SchedulesService` ganan el recalculo; endpoint nuevo en
  `leads.controller.ts`.
- **Frontend**: `index.html` (título), `src/App.tsx` (valor de respaldo del horario).
- **Verificación**: se corre el recalculo contra `crm_reclutamiento` (311 leads del import de
  historial) y se confirma el cambio en `inWorkHours`/`arrivalHour`.
- **Dependencias**: ninguna nueva.
