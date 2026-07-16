# Tasks — add-lead-pipeline

## 1. Esquema y seeds

- [x] 1.1 Migración: `classification_rules` (category/target/keywords jsonb/active) con seed de las keywords de `src/utils/whatsappParser.ts` (CTA, RH interno, 4 tipos de vacante)
- [x] 1.2 Migración: `app_settings` (key pk, value jsonb) con seed `conversation_inactivity_days = 21`
- [x] 1.3 Migración: `conversations.status/closed_at`; `leads.arrival_hour/arrival_day/classification_source/referral_payload`

## 2. Motor de horario hábil

- [x] 2.1 Módulo `schedules`: hora/día local vía `Intl` en la TZ IANA del schedule, `isInWorkHours(instant, schedule)`
- [x] 2.2 `calculateWorkMinutes(start, end, schedule)` portado de la SPA evaluando en la TZ del schedule
- [x] 2.3 Tests unitarios obligatorios: independencia de la TZ del servidor, DST, fin de semana, end ≤ start

## 3. Clasificación determinista

- [x] 3.1 `ClassificationEngine` puro: match case/acento-insensible (NFD) sobre reglas; categoría + tipo de vacante + regla matcheada
- [x] 3.2 Servicio con carga de reglas desde DB (cache 60 s)
- [x] 3.3 Tests unitarios: RH interno, tipos de vacante con acentos, sin match, acumulación conservadora

## 4. Referral y pipeline

- [x] 4.1 Ampliar `NormalizedInboundMessage` y adaptador WhatsApp con `referral` opcional (+ tests con payload Click-to-WhatsApp)
- [x] 4.2 `LeadPipelineService`: lead por persona (crear/reusar), datos de llegada con el motor de horarios, clasificación acumulativa respetando `classification_source=human`
- [x] 4.3 Atribución: match `campaigns.external_id`, `origin` paid/organic, `referral_payload` cuando no hay campaña; eventos `lead.created/classified/attributed`
- [x] 4.4 Integrar en la ingestión: cierre por inactividad configurable (status/closed_at + `conversation.closed`) y llamada al pipeline post-commit (nunca en duplicados)

## 5. Cierre

- [x] 5.1 Tests de integración: primer contacto crea lead clasificado y atribuido; conversación expirada abre nueva; duplicado no re-ejecuta pipeline; corrección humana intocable
- [x] 5.2 Verificación completa: lint + suite entera + curl con payload referral real y revisión de filas/eventos en DB
