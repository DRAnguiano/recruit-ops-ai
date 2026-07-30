## Why

`add-campaign-offers` construyó la oferta versionada (borrador → publicación inmutable), pero hoy
no hay ningún vínculo entre una contratación y la oferta que el candidato realmente vio. Sin esto,
el ejemplo del propio análisis del proyecto no es posible: «Oferta V1 vigente 1-7 jul, Marketing la
cambia a V2 el 8 de jul — el operador contratado el día 5 debe seguir asociado a V1 para siempre»,
aun si después alguien correlaciona bajas tempranas con ofertas incumplidas. `employment_episodes`
ya congela reclutador y campaña al contratar; falta el mismo tratamiento para la oferta.

## What Changes

- **`employment_episodes` gana `offerVersionId`** (FK nullable a `campaign_offers`): al abrir o
  enriquecer un episodio, `ensureForOperator` resuelve la oferta **vigente** de la campaña en ese
  momento (mayor versión publicada) y la congela — igual criterio que `hiredByAgentId`/`campaignId`:
  se fija una sola vez, nunca se sobrescribe aunque se publique una versión nueva después.
- **Sin oferta publicada → `offerVersionId` queda null** (nunca se inventa una oferta si la campaña
  no tiene ninguna versión publicada al momento de la contratación).
- **Lectura**: `GET /api/employment-episodes` expone el resumen de la oferta congelada (versión,
  sueldo anunciado, vigencia) cuando existe.
- **UI**: la tabla «Registro de contrataciones (inmutable)» muestra la oferta (versión + sueldo) que
  vio ese candidato, junto a reclutador y campaña.

Fuera de alcance: correlacionar oferta con bajas tempranas (requiere ambos datasets ya poblados con
casos reales — análisis futuro); editar/reasignar la oferta de un episodio ya fijado (va contra la
inmutabilidad, igual que reclutador/campaña).

## Capabilities

### Modified Capabilities

- `employment-episodes`: el episodio también congela la oferta vigente de la campaña al momento de
  la contratación.

## Impact

- **Backend**: `schema.ts` (columna nueva), migración `0017`, `EmploymentEpisodesService`
  (resolver oferta vigente al fijar atribución), `list()` con el resumen de oferta.
- **Frontend**: `src/types.ts` (`EmploymentEpisode` += resumen de oferta), tabla de contrataciones
  en `App.tsx`.
- **Datos**: migración aditiva (columna nullable). **Sin dependencias nuevas.**
