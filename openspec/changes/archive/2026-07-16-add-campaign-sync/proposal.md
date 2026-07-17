# add-campaign-sync — Proposal

## Why

Las campañas hoy solo entran por CSV o captura manual: el gasto real, los clicks y los
leads reportados viven en Meta y nadie los sincroniza. La tesis del producto exige "datos
reales de cada campaña, nunca simulados" (project.md §3.4) y la atribución exacta ya
funciona por `referral` — pero cuando el lead llega ANTES de que la campaña exista
localmente, queda con `referralPayload` huérfano esperando re-atribución. Además arrastra
la deuda `spend_mxn`: el usuario definió que el dinero de campañas es USD con moneda
explícita (decisión §3.14).

## What Changes

- **Sync read-only con Meta Marketing API**: un job periódico (BullMQ repetible, intervalo
  configurable vía settings, default 60 min) lee campañas e insights (gasto, clicks,
  leads) de la cuenta publicitaria (`META_AD_ACCOUNT_ID` + token `ads_read`) y hace upsert
  local por `externalId` con `source='meta_api'`. Nunca escribe en Meta; nunca inventa
  datos: sin token/cuenta configurados el sync queda deshabilitado con log.
- **Moneda explícita**: `campaigns.spend_mxn` → `spend` + columna `currency` (ISO-4217,
  default `USD`); la moneda real la reporta la cuenta publicitaria. API, bulk CSV y SPA se
  actualizan al nuevo contrato.
- **Re-atribución de referrals huérfanos**: tras cada sync, los leads con
  `referralPayload` y sin `campaignId` se re-evalúan contra las campañas recién
  sincronizadas → `lead.attributed` (cierra el ciclo previsto en add-lead-pipeline).
- **Disparo manual**: `POST /api/campaigns/sync` encola un sync inmediato (para el botón
  de la UI), auditado con `actor='user'`.
- **El CSV sigue siendo fallback**: el bulk existente no cambia de semántica; el sync no
  toca campañas `source='csv'|'manual'` salvo que compartan `externalId`.

## Capabilities

### New

- `campaign-sync`: cliente Marketing API, job periódico, upsert por `externalId`, moneda
  de la cuenta, disparo manual.

### Modified

- `campaign-attribution`: re-atribución de `referralPayload` huérfanos tras el sync.
- `catalog-api`: el contrato de campañas expone `spend` + `currency` (antes `spendMxn`).

## Impact

- **Schema**: migración rename `spend_mxn`→`spend` + columna `currency` (aditiva; el
  rename es seguro porque solo el backend/SPA de este repo consumen la columna).
- **Env nuevas (opcionales)**: `META_ADS_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`,
  `MARKETING_API_BASE_URL` (default Graph; configurable para tests).
- **Código**: módulo `campaigns` nuevo (cliente + sync + job), `leads` (re-atribución),
  catalog schemas, mappers de la SPA.
- **No simulado**: tests con servidor HTTP falso local (patrón media/outbound);
  la verificación con la cuenta real queda pendiente de que el usuario configure el token.
