# Tasks — add-employment-episode-hire-record

## 1. Esquema y migración

- [x] 1.1 `schema.ts`: tabla `employmentEpisodes` (operatorId unique NOT NULL, personId, leadId,
      hiredByAgentId, campaignId, hireDate, episodeType default 'new', snapshotAt, timestamps) con
      FKs a operators/people/leads/agents/campaigns.
- [x] 1.2 Migración `server/drizzle/0013_employment-episodes.sql` (CREATE TABLE + índice por
      operator_id unique) + entrada en `meta/_journal.json`.

## 2. Servicio y alta

- [x] 2.1 `EmploymentEpisodesService.ensureForOperator(operatorId, attribution)`: inserta si no
      existe (`onConflictDoNothing` por operatorId); si existe y le faltan campos de atribución, los
      rellena una sola vez (nunca sobrescribe un valor ya fijado). Determina `episodeType`
      ('rehire' si el `personId` ya tiene episodio previo).
- [x] 2.2 Emitir `employment_episode.created` al crear un episodio nuevo.
- [x] 2.3 `EmploymentEpisodesService.backfill()`: por cada operador, resuelve el lead casado
      (`matched_operator_id`) para la atribución y llama a `ensureForOperator`. Idempotente.
- [x] 2.4 `LeadsService.linkOperator`: tras vincular, llamar a `ensureForOperator` con la atribución
      del lead (personId, leadId, assignedAgentId, campaignId, hireDate del operador).
- [x] 2.5 Módulo/DI: `EmploymentEpisodesModule` (o proveer el servicio donde corresponda) sin
      imports cruzados indebidos.

## 3. Lectura + UI

- [x] 3.1 Controller: `GET /api/employment-episodes` (join operator/agent/campaign → operador, empNo,
      fecha, reclutador, campaña, tipo) y endpoint/CLI para disparar el backfill.
- [x] 3.2 Frontend: tipo + fetch en `src/api`, y tabla «Registro de contrataciones (inmutable)» en la
      pestaña Atribución (operador · fecha · reclutador que contrató · campaña · tipo), con estado
      vacío.

## 4. Verificación

- [x] 4.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [x] 4.2 Aplicar la migración y correr el backfill contra `crm_reclutamiento`; confirmar 637
      episodios (1 por operador), cuántos con reclutador/campaña (atribuidos) vs. sin atribución, e
      idempotencia en 2ª corrida.
- [x] 4.3 Verificar que vincular un candidato a un operador desde el panel manual abre/rellena su
      episodio con la atribución congelada y emite el evento.
