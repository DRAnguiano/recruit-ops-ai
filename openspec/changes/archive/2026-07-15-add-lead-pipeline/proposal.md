# add-lead-pipeline

## Why

Los mensajes ya entran solos (change `add-channel-webhooks`) pero mueren como filas de
`messages`: nadie los convierte en leads, no se clasifican y no hay atribución de campaña.
Este change porta la lógica probada de la SPA (`src/utils/whatsappParser.ts`) al motor
determinista del backend — como **reglas configurables en datos, no keywords en código**
(regla 1 de `openspec/project.md` §4) — e implementa las decisiones de producto de la
revisión 2026-07-15: cierre de conversación por inactividad configurable (default 21 días)
y atribución exacta por `referral` de Click-to-WhatsApp.

## What Changes

- **Lead automático**: todo mensaje entrante garantiza un lead para la persona (uno por
  persona, como hoy en la SPA); primer mensaje fija `first_message_at`, hora/día de llegada
  y si cayó en horario hábil (evaluado contra la TZ IANA del schedule, nunca la del servidor).
- **Clasificación determinista con reglas en datos**: tabla `classification_rules`
  (categoría + keywords, seed con las keywords actuales de la SPA: CTA de anuncios, RH
  interno, tipos de vacante). El motor clasifica Vacante/RH interno/Otro y detecta tipo de
  vacante; editar keywords será UI en `add-configurable-catalogs`, sin tocar código.
- **Atribución por referral**: el adaptador de WhatsApp extrae el objeto `referral` de
  Click-to-WhatsApp (ad id, url, ctwa_clid); la ingestión lo cruza contra
  `campaigns.external_id` y fija `lead.campaign_id` y `origin` = paid; sin referral el
  origen queda orgánico (las heurísticas de CTA siguen aportando señal).
- **Motor de horario hábil**: puerto de `calculateWorkMinutes` a un módulo `schedules` con
  TZ IANA correcta y tests unitarios obligatorios; deja lista la métrica de primera
  respuesta para cuando exista el envío saliente (change 6).
- **Cierre por inactividad**: conversación abierta con más de N días sin mensajes
  (`app_settings.conversation_inactivity_days`, default 21, configurable) se cierra y el
  mensaje nuevo abre otra; nada se borra. Nuevas columnas `conversations.status/closed_at`.
- **Eventos**: `lead.created`, `lead.classified`, `lead.attributed`, `conversation.closed`.
- **No incluye**: envío saliente ni métrica de primera respuesta calculada (falta outbound),
  media/audio (change 4), merge asistido de personas, UI.

## Capabilities

### New Capabilities

- `lead-pipeline`: creación/actualización automática de leads desde mensajes entrantes,
  con datos de llegada y eventos de dominio.
- `deterministic-classification`: motor de clasificación por reglas de keywords
  almacenadas como datos versionables (no código), con seed de las reglas actuales.
- `campaign-attribution`: atribución de lead a campaña vía `referral` de Meta, con
  fallback orgánico.
- `work-hours-engine`: cálculo de minutos hábiles y pertenencia a horario laboral contra
  la TZ IANA del schedule.

### Modified Capabilities

- `channel-adapter`: el mensaje normalizado incorpora `referral` opcional (WhatsApp).
- `message-ingestion`: la resolución de conversación respeta el cierre por inactividad
  configurable y dispara el pipeline de leads tras persistir el mensaje.

## Impact

- Código: módulo `leads` nuevo, módulo `schedules` nuevo, ampliación de `channels`
  (adaptador + ingestión), migraciones (2 tablas nuevas: `classification_rules`,
  `app_settings`; columnas de estado en `conversations`).
- Sin cambios en la SPA todavía.
- Sin dependencias nuevas.
