# Tasks — add-campaign-offers

## 1. Esquema y migración

- [x] 1.1 `schema.ts`: tabla `campaignOffers` (campaignId FK NOT NULL, version integer NOT NULL,
      status text default 'draft', publishedAt nullable, ~20 columnas de contenido —
      salaryText, paymentForm, bonuses, benefits, perDiem, restDays, schedule, routeType, circuit,
      unitType, vacancyType, newUnits boolean, unitCondition, maintenanceCulture, operatorCare,
      safety, stability, familyMessage, substanceFreePolicy boolean, requirements, location,
      adText, creativeRef, cta, validFrom date, validTo date, timestamps) con
      UNIQUE(campaignId, version).
- [x] 1.2 Migración `server/drizzle/0016_campaign-offers.sql` + entrada en `meta/_journal.json`.

## 2. Backend

- [x] 2.1 `campaign-offers.schemas.ts`: zod de creación (content fields, todos opcionales salvo
      campaignId) y de update (mismo shape, sin campaignId/version/status).
- [x] 2.2 `campaign-offers.controller.ts`: `POST /api/campaigns/:campaignId/offers` (crea draft,
      version = MAX(version)+1 para esa campaña o 1); `PATCH /api/campaign-offers/:id` (edita, 409
      si `status='published'`); `POST /api/campaign-offers/:id/publish` (fija status+publishedAt,
      404 si ya publicada); `GET /api/campaigns/:campaignId/offers` (todas las versiones, marca
      cuál es la vigente = mayor version con status='published').
- [x] 2.3 Evento de dominio en creación y en publish (`campaign_offer.created`,
      `campaign_offer.published`).
- [x] 2.4 Registrar el controller (mismo módulo de catálogo/campañas, sin módulo nuevo si no hace
      falta).

## 3. Frontend

- [x] 3.1 `src/types.ts`: `CampaignOffer` (todas las columnas + `isCurrent: boolean` derivado por
      el backend en la respuesta de lista).
- [x] 3.2 `src/api/campaign-offers.ts`: fetch de list/create/update/publish.
- [x] 3.3 Panel en `CampaignsView.tsx` (por campaña, expandible o modal): formulario del borrador
      (todos los campos de contenido), botón «Publicar» (deshabilitado si no hay draft o ya está
      publicado), historial de versiones publicadas de solo lectura con su vigencia.

## 4. Verificación

- [x] 4.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [x] 4.2 Verificación funcional contra `crm_reclutamiento`: crear un draft para una campaña real,
      editarlo, publicarlo, confirmar que un `PATCH` posterior es rechazado (409), crear una
      segunda versión y confirmar que la primera publicada sigue intacta y que la vigente pasa a
      ser la nueva.
