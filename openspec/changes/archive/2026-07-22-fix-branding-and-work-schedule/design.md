## Context

Tres artefactos comparten el horario oficial hoy incorrecto (`07:45–17:10` en vez de
`07:30–17:30`):
1. La fila seed `work_schedules(name='default')`, insertada por `0001_append-only-events-and-seed.sql`
   (ya aplicada; migración inmutable).
2. El `FALLBACK` de `SchedulesService` (`schedules.service.ts:9-14`), usado solo si no hay fila.
3. El respaldo de la SPA (`src/App.tsx:69-70`), usado solo si el backend no responde.

El pipeline de leads (`lead-pipeline.service.ts:57-70`) calcula `inWorkHours`, `arrivalHour`,
`arrivalDay` **una sola vez**, al crear el lead, contra el horario vigente en ese momento. Los 311
leads del import de historial se crearon con `07:45–17:10`, así que sus métricas de jornada quedaron
sesgadas y no se recalculan solas al corregir el horario.

El `<title>` de `index.html` sigue en «My Google AI Studio App» — único vestigio del nombre por
defecto de Google AI Studio; el resto del proyecto ya usa el branding de Transmontes.

## Goals / Non-Goals

**Goals:**
- Título de pestaña correcto.
- Horario oficial `07:30–17:30` en las tres fuentes, sin pisar una personalización manual ya hecha.
- Recalcular las métricas de jornada de los leads existentes contra el horario vigente, de forma
  reutilizable (no un script de un solo uso).

**Non-Goals:**
- Calcular `firstResponseMinutesNatural`/`firstResponseMinutesWork` (gap preexistente: columnas
  existen, el backend nunca las llena). Se anota como candidato a change futuro.
- Cambiar el contrato de creación de leads (el pipeline sigue calculando igual al ingerir).
- Convertir el título en dato configurable (es texto estático, no regla de negocio).

## Decisions

### 1. Corrección del horario: migración nueva condicional, no editar la 0001
`0001` ya corrió y es inmutable (editarla cambiaría su hash y rompería `db:migrate` en las BD ya
migradas). Se agrega `0012_fix-default-schedule.sql` con:
```sql
UPDATE "work_schedules" SET "start_time"='07:30', "end_time"='17:30'
WHERE "name"='default' AND "start_time"='07:45' AND "end_time"='17:10';
```
El `WHERE` con los valores viejos hace la migración **idempotente y no destructiva**: si alguien ya
personalizó el horario desde la UI, no se pisa. En una BD nueva, `0001` siembra `07:45` y acto
seguido `0012` lo corrige a `07:30` — coherente en fresh install y en BD existente.

### 2. Fallbacks de código alineados al valor oficial
`SchedulesService.FALLBACK` y el respaldo de `src/App.tsx` pasan a `07:30–17:30`. Son solo
salvavidas (fila ausente / backend caído), pero deben reflejar el valor correcto. Se actualiza
también el comentario de ejemplo en `src/types.ts` (`"07:45"` → `"07:30"`).

### 3. Recalculo como endpoint reutilizable, no script
Nueva capacidad `POST /api/leads/recalculate-schedule-metrics`: obtiene el `work_schedule` vigente,
recorre los leads con `firstMessageAt != null` y reescribe `inWorkHours`/`arrivalHour`/`arrivalDay`
con `isInWorkHours`/`getLocalParts` (las mismas funciones que usa el pipeline — cero divergencia de
lógica). Devuelve `{ scanned, updated }`. Reutilizable cada vez que el horario cambie, no solo para
esta corrección. Emite un `domain_event` `lead.schedule_metrics_recalculated` con el conteo para
auditoría (regla §4 de auditabilidad).

## Risks / Trade-offs

- **El recalculo reescribe métricas históricas** → correcto y deseado: son valores derivados del
  horario, no datos capturados. Sólo toca 3 columnas derivadas; no altera `firstMessageAt` ni estado.
- **Orden de migraciones en fresh install** (0001 siembra mal, 0012 corrige) → dos escrituras en vez
  de una, pero mantiene 0001 inmutable, que es la restricción dura.
- **El endpoint recorre todos los leads** → para 311 es trivial; si creciera, se paginaría. Fuera de
  alcance ahora.
