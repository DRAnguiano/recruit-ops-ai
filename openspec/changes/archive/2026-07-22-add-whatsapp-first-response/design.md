## Context

Flujo actual del import (whatsapp-history-import):
- `parseWhatsAppHistory(file, settings)` (frontend) parsea el zip anidado y produce `ChatLead[]`.
  Cada `ChatLead` YA tiene `responded`, `firstResponseMinutesNatural`, `firstResponseMinutesWork`
  (calculados por `parseWhatsAppChat` desde los timestamps del reclutador, con el `work_schedule`
  pasado en `settings`) — ver `src/types.ts:85-87`.
- `ImportModule.tsx:246-259` arma lotes: `messages = batch.flatMap(chatLeadToInbound)` y hace
  `POST /api/import/whatsapp-history` con `{ agent, messages }`. `chatLeadToInbound` filtra los
  mensajes del agente, así que las métricas del `ChatLead` se pierden.
- El controller ingiere los inbound (idempotente por `(channel, external_message_id)`) y asigna la
  reclutadora a los leads nuevos. Nunca escribe `responded`/`firstResponseMinutes*`.
- `mapLead` (frontend) YA propaga `responded`/`firstResponseMinutes*` de la API al dashboard
  (`mappers.ts:206-208`); el dashboard los usa para tasa de respuesta y mediana. Las columnas
  existen en `leads`. Por eso basta con persistirlos en el backend.

## Goals / Non-Goals

**Goals:** persistir las métricas de primera respuesta ya calculadas, desde el import; que el
dashboard muestre tasa de respuesta y medianas reales; auditable (fuente = export).

**Non-Goals:** recomputar primera respuesta en vivo; ingerir los mensajes del agente como outbound;
tocar `isConversationReal`; migraciones; perfilamiento/atribución/SLA.

## Decisions

### 1. Nuevo `leadMetrics` en el payload, keyed por `externalUserId`
El payload agrega `leadMetrics?: { externalUserId, responded, firstResponseMinutesNatural?,
firstResponseMinutesWork? }[]`. `externalUserId` es el mismo identificador (teléfono en dígitos) que
usa la ingestión para localizar a la persona, así que el controller puede casar métrica → lead sin
ambigüedad. Es opcional para no romper el contrato existente (un import viejo sin métricas sigue
válido).

### 2. Frontend arma `leadMetrics` desde el `ChatLead`, no recalcula
Junto a `chatLeadToInbound`, se mapea cada `ChatLead` del lote a su métrica. Se necesita el
`externalUserId` del chat: se deriva igual que en `chatLeadToInbound` (dígitos del teléfono). Se
añade un helper `chatLeadToMetric(cl)` en `whatsapp-history.ts` para no duplicar esa derivación.

### 3. Controller: update por lead + evento de auditoría
Tras `ingest` y `assignAgentToNewLeads`, por cada `leadMetric`: `channel_identity(externalUserId)` →
`person` → `lead`, y `UPDATE leads SET responded, first_response_minutes_natural/work`. Se
sobrescribe con el valor del export (autoridad del historial re-importado). Emite
`lead.first_response_imported` con `{ source: 'whatsapp-history', responded, minutesWork }` para
auditoría (regla §4). Leads sin métrica quedan intactos.

### 4. Consistencia del tiempo hábil con el horario corregido
`firstResponseMinutesWork` lo calcula el parser con el `settings` (horario) vigente en la app, que
ya es 07:30–17:30 tras `fix-branding-and-work-schedule`. Re-importar ahora produce el hábil correcto.

## Risks / Trade-offs

- **Sobrescribir métricas** en re-import → correcto: el export es la fuente autoritativa; el valor es
  determinista para el mismo chat. No toca `firstMessageAt`, estado ni mensajes.
- **`responded` depende de la calidad del export** (un chat exportado incompleto puede parecer no
  respondido) → es la misma limitación que ya advierte el análisis; el dato es fiel a lo exportado,
  no una afirmación absoluta. La fuente queda registrada en el evento.
- **`externalUserId` debe casar exactamente** con el de la ingestión → se usa la misma derivación
  (helper compartido), evitando desalineación.
