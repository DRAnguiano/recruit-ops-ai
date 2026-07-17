# Tasks — add-campaign-sync

## 1. Moneda y schema

- [x] 1.1 Migración: rename `spend_mxn`→`spend` + columna `currency` (default 'USD');
      schema.ts, catalog schemas (`spend`/`currency` en create/update/bulk), tests y
      mappers de la SPA actualizados al nuevo contrato

## 2. Sync con Marketing API

- [x] 2.1 Env `META_ADS_ACCESS_TOKEN` / `META_AD_ACCOUNT_ID` / `MARKETING_API_BASE_URL`
      (zod + `.env.example`) y `MarketingApiClient` (cuenta+currency, campañas paginadas,
      insights nivel campaña; errores tipados)
- [x] 2.2 `CampaignSyncService`: upsert por `externalId` (solo campos de Meta; adopta CSV
      con mismo externalId; nunca toca campañas sin externalId) + evento `campaign.synced`
- [x] 2.3 Re-atribución de referrals huérfanos (método compartido con `attributeLead` en
      leads) + `lead.attributed` con `reattributed: true`
- [x] 2.4 Job repetible `campaigns.sync` (intervalo por setting
      `campaign_sync_interval_minutes`, default 60) + `POST /api/campaigns/sync` (202 dedup;
      409 `MARKETING_NOT_CONFIGURED` sin credenciales) con evento actor=user

## 3. Tests y cierre

- [x] 3.1 Tests e2e con fake Marketing API: crea/actualiza/adopta CSV, currency de la
      cuenta, re-atribución, sin token → no-op, trigger manual
- [x] 3.2 SPA: mapper `spend`+`currency` (mostrar moneda en la vista de campañas); README
      (`server/`); suite completa + lint + verificación manual (fake API → sync → campañas
      y re-atribución visibles por REST)
