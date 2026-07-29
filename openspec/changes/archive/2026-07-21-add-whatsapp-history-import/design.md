## Context

Los exports de WhatsApp vienen como `.zip` anidado: un zip por reclutadora
(`Chats Hernan.zip`) contiene un zip por conversación (`Chat de WhatsApp con +52 ….zip`), y
cada uno un `.txt` con el formato español Android/iOS. Ya existen tres piezas reutilizables:
`parseWhatsAppChat(text, agentName, settings)` en `src/utils/whatsappParser.ts` (regex robusto,
detección candidato/agente, teléfono, origen, tipo de vacante); `jszip` como dependencia de la
SPA; y `MessageIngestionService.ingest(NormalizedInboundMessage[])` en el backend, que crea
persona/identidad/conversación/lead **idempotente** por `(channel, external_message_id)` y ya
corre el pipeline de leads. El reto es conectar las tres sin duplicar lógica ni romper la
ingestión en vivo.

## Goals / Non-Goals

**Goals:**
- Ingerir los 386 chats históricos al backend con sus fechas reales, idempotente.
- Reutilizar el parser del cliente y el servicio de ingestión existentes.
- No disparar bot, envíos ni notificaciones en vivo por datos históricos.

**Non-Goals:**
- Parser nuevo (se reutiliza `parseWhatsAppChat`).
- Importar operadores, pautas de Meta o HC 2026 (otros changes / dependen de C2).
- Atribuir a campaña específica sin `ad_id` (solo origen Facebook/orgánico).
- Descarga de media de los chats (los `.txt` no traen binarios utilizables; se ignoran los
  `<Multimedia omitido>`).

## Decisions

### 1. Parsear en el cliente, ingerir por un endpoint dedicado
La SPA descomprime el zip con `jszip` y, por cada `.txt`, llama a `parseWhatsAppChat`. Se agrega
un adaptador `chatLeadToInbound(chatLead, agent)` que convierte los `Message[]` del parser a
`NormalizedInboundMessage[]` (solo los mensajes entrantes del candidato; los del agente definen
el `sentAt` de respuesta pero no se ingieren como inbound). El backend expone
`POST /api/import/whatsapp-history` que recibe el lote y delega en `MessageIngestionService`.
- *Alternativa descartada*: portar el parser (~250 líneas) al backend y subir el zip crudo →
  duplica lógica ya probada en el cliente y mete descompresión de zips anidados al servidor.
- *Por qué el endpoint dedicado y no el webhook*: el webhook valida firma de Meta y encola; el
  histórico no tiene firma ni debe pasar por la cola en vivo. Un endpoint propio deja explícito
  que es carga administrativa.

### 2. `externalMessageId` estable para idempotencia
Los mensajes históricos no traen id del proveedor. Se deriva uno **determinista** por mensaje:
`wa-hist:{phone10}:{epochSegundos}:{hash corto del texto}`. Así reimportar el mismo chat golpea
el `onConflictDoNothing` sobre `unique(channel, external_message_id)` y no duplica. El mismo
candidato desde el mismo teléfono cae en la misma persona (dedup por teléfono E.164 existente).

### 3. Sin bot: garantizado por el default de schema, no por un flag nuevo
*(Revisado durante la implementación: más simple de lo planeado.)* No hace falta ningún flag
`historical: true`. `conversations.attention_mode` ya tiene default `'human'` y
`MessageIngestionService.resolveConversation` nunca lo sobreescribe al crear; `BotQueue`
solo encola `bot.notify` cuando `shouldNotify()` confirma `attentionMode==='bot' && status==='open'`.
Como las conversaciones nuevas nacen en `human`, el histórico jamás dispara el bot — se verifica
con un test de regresión (tarea 3.1), no con código nuevo. Tampoco se fuerza `closed`: el
`MessageIngestionService` ya cierra/reabre por inactividad comparando la fecha real de cada
mensaje contra `conversation_inactivity_days`, igual que en vivo; forzar `closed` al final sería
peor (una conversación real que debería seguir abierta quedaría cerrada sin motivo).

### 4. Fechas reales, TZ correcta
Cada `NormalizedInboundMessage.sentAt` usa la fecha/hora del chat. El parser ya construye
`Date` local; se serializa a ISO. El motor de horas hábiles del backend recomputa
`firstResponseMinutesNatural/Work` con el `work_schedule` vigente — por eso conviene corregir
antes el horario oficial (07:30–17:30), o documentar que el histórico se calculó con el vigente.

### 5. Reclutadora desde la carpeta; Dulce→Damaris
El nombre del zip de reclutadora (`Chats Hernan`) mapea a la agente. Un diccionario de alias
normaliza `Dulce`→`Damaris` (misma persona, por indicación del negocio). Las agentes se siembran
si no existen (vía `POST /api/agents`, ya expuesto) antes de importar; el lead se asigna a ella.

### 6. Ingestión en lotes con reporte
La SPA postea en lotes (p. ej. 25 conversaciones) y agrega el resultado: conversaciones
procesadas, mensajes insertados, leads creados, duplicados omitidos, chats sin candidato
(descartados). Se muestra un resumen al terminar, como los imports existentes.

## Risks / Trade-offs

- [Un chat sin mensajes del candidato (solo el agente) no produce lead] → el parser ya devuelve
  `null`; se cuenta como «omitido», no error.
- [Teléfonos con formato raro (+1 EE.UU., extensiones)] → `normalizePhone` toma los últimos 10
  dígitos; dos números distintos que compartan 10 dígitos finales colisionarían (muy improbable).
  Aceptado; la reconciliación fina de identidad es trabajo de un change posterior.
- [Recalcular métricas si luego se corrige el horario] → documentado; el histórico se ingiere una
  vez y las métricas hábiles derivan del `work_schedule` al momento del cálculo.

## Migration Plan

Sin migración de esquema (usa tablas existentes). La «carga» de los 386 chats es un paso de
verificación manual contra `crm_reclutamiento`, idempotente (re-ejecutable).

## Open Questions

- ¿El horario oficial (07:30–17:30) se corrige **antes** de importar el histórico, para que las
  métricas hábiles nazcan correctas? (Recomendado; si no, se recalculan luego.) Se decide al
  dialogar los 3 puntos.
