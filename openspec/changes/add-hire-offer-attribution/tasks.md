# Tasks — add-hire-offer-attribution

## 1. Esquema y migración

- [x] 1.1 `schema.ts`: `employmentEpisodes` += `offerVersionId: uuid('offer_version_id')
      .references(() => campaignOffers.id)` (nullable).
- [x] 1.2 Migración `server/drizzle/0017_employment-episode-offer.sql` (ADD COLUMN + FK) + entrada
      en `meta/_journal.json`.

## 2. Backend

- [x] 2.1 `EmploymentEpisodesService.ensureForOperator`: si hay `campaignId` (nuevo o ya fijado) y
      `offerVersionId` sigue null, resolver la oferta publicada de mayor versión de esa campaña y
      fijarla (mismo criterio «una sola vez, nunca sobrescribir» del resto de la atribución).
- [x] 2.2 `EmploymentEpisodesService.list()`: `leftJoin` a `campaignOffers` por `offerVersionId`,
      exponer `offerVersion`/`offerSalaryText`/`offerValidFrom`/`offerValidTo` (null si no hay).

## 3. Frontend

- [x] 3.1 `src/types.ts`: `EmploymentEpisode` += `offerVersion`, `offerSalaryText`,
      `offerValidFrom`, `offerValidTo` (todos `| null`).
- [x] 3.2 `src/App.tsx`: columna «Oferta» en la tabla «Registro de contrataciones (inmutable)»
      (versión + sueldo anunciado, o «Sin oferta capturada»).

## 4. Verificación

- [x] 4.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [ ] 4.2 Aplicar la migración; verificar contra `crm_reclutamiento`: vincular un candidato a un
      operador para una campaña con oferta publicada → el episodio congela esa versión; publicar
      una versión nueva después → el episodio ya contratado sigue mostrando la vieja; vincular para
      una campaña sin oferta publicada → `offerVersionId` queda null, sin inventar nada.
