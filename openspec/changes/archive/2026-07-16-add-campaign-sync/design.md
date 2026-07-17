# add-campaign-sync — Design

## Context

`campaigns` ya existe (externalId único, source meta_api|csv|manual, métricas) y la
atribución por referral funciona cuando la campaña existe localmente; si no, el lead
guarda `referralPayload` y espera. El bulk CSV está en producción. Falta el lado Meta:
leer gasto/clicks/leads reales y traer las campañas automáticamente.

## Goals / Non-Goals

**Goals:**

- Upsert periódico y bajo demanda de campañas reales desde Marketing API (read-only).
- Moneda explícita por campaña (la reporta la cuenta publicitaria; default USD).
- Re-atribución automática de referrals huérfanos al aparecer su campaña.

**Non-Goals:**

- Gestión activa (pausar/activar campañas EN Meta) → F3 `add-campaign-management`,
  condicionada a App Review; `pauseRequestedAt` sigue siendo cola manual.
- Métricas por ad/adset o breakdowns: nivel campaña basta para las vistas actuales.
- UI nueva: la vista de Campañas existente ya muestra estos campos.

## Decisions

### 1. Cliente propio mínimo (`MarketingApiClient`), sin SDK de Meta

Tres llamadas: `GET /act_{id}?fields=currency` (moneda de la cuenta),
`GET /act_{id}/campaigns?fields=id,name,status,start_time,stop_time` (paginado por
`paging.next`) y `GET /act_{id}/insights?level=campaign&fields=campaign_id,spend,clicks,actions&date_preset=maximum`
(leads = action_type `lead`/`onsite_conversion.lead_grouped`). El SDK oficial arrastra
peso y su propio ciclo de versiones; con fetch + tipos estrechos y
`MARKETING_API_BASE_URL` configurable, los tests corren contra un HTTP server local
(patrón probado en media y outbound). Errores → `DomainError MARKETING_API_ERROR`.

### 2. Upsert por `externalId`; el sync es dueño solo de lo que trae de Meta

Cada campaña remota upserta por `externalId`: crea con `source='meta_api'` o actualiza
métricas (spend, currency, clicks, leadsReported, status activo/pausado, fechas) sin tocar
campos locales de negocio (`targetAgentId`, `vacancyId`, `modality`, `pauseRequestedAt`).
Si un CSV previo creó la campaña con el mismo `externalId`, el sync la adopta
(`source→meta_api`): los datos reales ganan al fallback. Campañas locales sin
`externalId` jamás se tocan. Evento `campaign.synced` (actor system) con contadores.

### 3. Job repetible BullMQ + disparo manual por API

Cola `campaigns.sync` con job repetible cuyo intervalo viene de settings
(`campaign_sync_interval_minutes`, default 60, editable por `PUT /api/settings/…`; el
job se re-programa al cambiar). `POST /api/campaigns/sync` encola una corrida inmediata
(jobId dedup `manual`) y responde 202 con `{queued: true}`; sin token configurado responde
409 `CHANNEL_NOT_CONFIGURED`-style (`MARKETING_NOT_CONFIGURED`). El worker corre el sync
completo con reintentos del job.

### 4. Re-atribución como paso del sync, reutilizando la lógica del pipeline

Tras el upsert, un paso busca leads con `referralPayload != null AND campaign_id IS NULL`,
extrae `sourceId` del payload y matchea contra `campaigns.externalId`; si aparece →
`campaignId` + `lead.attributed` (actor system, payload con `reattributed: true`). Es el
mismo criterio de `attributeLead`; se factoriza a método compartido en `leads` para no
duplicar reglas.

### 5. Migración de moneda: rename + columna, sin puente

`spend_mxn` → `spend` (mismo tipo numeric) + `currency text NOT NULL DEFAULT 'USD'`.
Los consumidores viven en este repo (API catalog, bulk, SPA) y se actualizan en el mismo
change; no se mantiene alias `spendMxn`. El CSV fallback importa con la moneda que el
usuario indique (default USD). Nota: los datos históricos cargados como MXN conservan su
número — el usuario decide si los corrige vía CSV re-import; no adivinamos conversión.

## Risks / Trade-offs

- **[Rate limits de Marketing API]** intervalo default 60 min y 3 llamadas por corrida →
  irrelevante para límites; el manual está deduplicado por jobId.
- **[`date_preset=maximum`]** trae acumulados de vida de campaña, no por semana → las
  vistas actuales (gasto total, CPL) funcionan; breakdown temporal queda para F3.
- **[Rename de columna]** rompe consumidores externos hipotéticos → no existen; el repo
  es el único consumidor (verificado).

## Migration Plan

Migración SQL (rename + add column) es reversible (rename inverso + drop). Deploy normal;
el job repetible se registra en el arranque. Sin token, el sistema se comporta como hoy.

## Open Questions

- Ninguna bloqueante. El token real (`ads_read`) y el `act_id` los configura el usuario
  cuando quiera activar el sync; todo lo demás queda funcionando con CSV.
