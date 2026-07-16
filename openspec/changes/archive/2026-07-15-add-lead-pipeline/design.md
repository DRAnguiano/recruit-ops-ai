# Design — add-lead-pipeline

## Context

La ingestión (change 2) persiste personas/conversaciones/mensajes de forma idempotente.
La SPA tiene lógica probada de clasificación y horario hábil en
`src/utils/whatsappParser.ts`, pero con dos vicios que este change corrige al portarla:
keywords hardcodeadas (viola la regla 1) y cálculo de horario con la TZ del navegador
(viola la regla de TZ IANA). Además implementa las decisiones de la revisión 2026-07-15
(§3.7 de project.md): cierre de conversación por inactividad configurable.

## Goals / Non-Goals

**Goals:**
- Ningún mensaje entrante sin lead: pipeline automático mensaje→lead clasificado y atribuido.
- Reglas de clasificación como datos (seed = keywords actuales de la SPA), motor puro y testeado.
- Horario hábil correcto en cualquier TZ de servidor (evaluación vía `Intl` con la TZ del schedule).
- Cierre de conversación por inactividad sin borrar nada.

**Non-Goals:**
- Métrica de primera respuesta calculada (necesita mensajes outbound — change 6; aquí solo
  queda listo el motor de minutos hábiles).
- UI de edición de reglas (change 10); media (change 4); score de candidatos (F3).

## Decisions

1. **Reglas de clasificación en tabla, no en código**: `classification_rules`
   (`id`, `category` ∈ {ad_cta, internal_hr, vacancy_type}, `target` (p. ej. tipo de
   vacante que detecta), `keywords` jsonb string[], `active`, timestamps). Seed con las
   keywords exactas de `whatsappParser.ts` (isAutomatedCTA, checkRHKeywords,
   detectVacanteType). El motor las carga y matchea case/acento-insensible
   (normalización NFD). Alternativa rechazada: enum de reglas en código con config de
   pesos — mantiene el vicio hardcodeado.
2. **Motor de clasificación puro**: `ClassificationEngine.classify(text, rules)` sin I/O →
   `{ classification, detectedVacancyType, matchedRule }`. El servicio que orquesta carga
   reglas (cache 60 s) y llama al motor. Puro = tests unitarios obligatorios triviales.
3. **Clasificación por acumulación conservadora**: el lead se clasifica con cada mensaje
   entrante; `internal_hr` y tipo de vacante solo se fijan si hay match; un lead ya
   clasificado como `vacancy` no regresa a `other` (la clasificación mejora, no oscila).
   La corrección humana (cuando exista la UI) tendrá precedencia — el pipeline no pisa
   valores marcados con fuente humana (columna `classification_source` ∈ system|human).
4. **`app_settings` clave-valor** (`key` pk, `value` jsonb): configuración operativa simple
   (`conversation_inactivity_days` = 21). Alternativa rechazada: tabla dedicada por
   setting — sobredimensionado; el patrón borrador/publicación inmutable llegará cuando
   haya editores de UI.
5. **Cierre de conversación al resolver, no con cron**: cuando llega un mensaje y la
   conversación abierta tiene `last_message_at` más viejo que N días, se marca
   `closed` + `closed_at` y se crea una nueva. Sin job nocturno: el estado "cerrada" solo
   importa cuando algo pasa. `conversation.closed` se emite en ese momento. (Un cron de
   cierre proactivo podrá añadirse cuando el inbox necesite mostrar "cerradas" en vivo.)
6. **Referral en el adaptador**: WhatsApp Cloud API incluye `referral` en el mensaje cuando
   el usuario llega por Click-to-WhatsApp (`source_id` = ad id, `source_url`, `ctwa_clid`,
   `source_type`). Se agrega `referral?` al `NormalizedInboundMessage`. La atribución
   matchea `campaigns.external_id = referral.source_id`; si no hay campaña registrada aún,
   guarda el referral crudo en el lead (`referral_payload` jsonb) para re-atribuir cuando
   el sync de campañas (change 7) la traiga.
7. **Horario hábil con `Intl.DateTimeFormat`**: para saber la hora local del schedule se
   formatea el instante UTC en la TZ IANA (`America/Mexico_City`) — sin dependencias
   nuevas, DST correcto. `calculateWorkMinutes(start, end, schedule)` porta el algoritmo
   día-a-día de la SPA pero evaluado en la TZ del schedule. Lead guarda `in_work_hours`,
   `arrival_hour`, `arrival_day` (columnas nuevas) calculados con esto.
8. **El pipeline corre tras la transacción de ingestión**, no dentro: si clasificar falla,
   el mensaje ya está persistido (nunca perder datos por un bug de reglas); el pipeline es
   re-ejecutable desde `messages` + `raw_payload`.

## Risks / Trade-offs

- [Keywords seed desactualizadas vs. la realidad] → son las mismas que hoy usa la SPA en
  producción manual; editarlas será UI en change 10 y mientras tanto SQL directo.
- [Cache de reglas 60 s] → cambio de reglas tarda ≤1 min en aplicar; aceptable sin UI.
- [Cierre lazy deja conversaciones "abiertas" viejas en queries] → los consumidores deben
  filtrar por `status='open' AND last_message_at > now()-N`; documentado en el spec para
  que `add-api-for-spa` lo respete.
- [Re-atribución pendiente si el referral llega antes que el sync de campañas] → el
  referral crudo queda en el lead; el change 7 incluirá el job de re-atribución.

## Migration Plan

Aditivo: 2 tablas nuevas, columnas nuevas en `conversations` y `leads` (nullable/default),
seed de reglas. Rollback = revertir migración. Sin impacto en datos existentes.

## Open Questions

- ¿La clasificación `internal_hr` debe además etiquetar la conversación para enrutarla a
  otro equipo (RH interno) cuando exista asignación? Se decide en `add-api-for-spa`.
