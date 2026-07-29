# Tasks — fix-branding-and-work-schedule

## 1. Branding

- [x] 1.1 `index.html`: `<title>` → `Transmontes Capital Humano`

## 2. Horario oficial 07:30–17:30

- [x] 2.1 Migración `server/drizzle/0012_fix-default-schedule.sql`: `UPDATE work_schedules SET
      start_time='07:30', end_time='17:30' WHERE name='default' AND start_time='07:45' AND
      end_time='17:10'` (+ entrada en `meta/_journal.json`)
- [x] 2.2 `server/src/schedules/schedules.service.ts`: `FALLBACK` → `07:30 / 17:30`
- [x] 2.3 `src/App.tsx`: respaldo de horario → `07:30 / 17:30`; `src/types.ts`: comentario de ejemplo

## 3. Recalculo de métricas de jornada (schedule-metrics-recalculation)

- [x] 3.1 `LeadsService`: método `recalculateScheduleMetrics()` que obtiene el `work_schedule`
      vigente, recorre leads con `firstMessageAt != null`, recomputa `inWorkHours`/`arrivalHour`/
      `arrivalDay` con `isInWorkHours`/`getLocalParts`, actualiza y devuelve `{ scanned, updated }`
- [x] 3.2 Emitir `domain_event` `lead.schedule_metrics_recalculated` con el conteo
- [x] 3.3 `leads.controller.ts`: `POST /api/leads/recalculate-schedule-metrics`

## 4. Verificación

- [x] 4.1 `npm run lint` (server + SPA) y `npm run build` del server
- [x] 4.2 Aplicar la migración (`npm run db:migrate`) contra `crm_reclutamiento`; confirmar
      `work_schedule` = `07:30–17:30`
- [x] 4.3 Ejecutar el recalculo contra los 311 leads; confirmar que `inWorkHours`/`arrivalHour`
      cambian donde el nuevo horario difiere del viejo (reportar `scanned`/`updated`)
- [x] 4.4 Anotar en `openspec/project.md` el gap de `firstResponseMinutes*` como change futuro
