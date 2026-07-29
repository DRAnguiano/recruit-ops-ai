# Tasks — add-whatsapp-history-import

## 1. Backend: endpoint de ingestión histórica

- [x] 1.1 `import/import.schemas.ts`: zod del lote (`agent`, `messages: NormalizedInboundMessage[]`
      con `channel='whatsapp'`, `externalMessageId`, `externalUserId`, `sentAt` ISO, `body`,
      opcionales `senderName`/`phoneE164`/`referral`)
- [x] 1.2 `import/whatsapp-history.controller.ts`: `POST /api/import/whatsapp-history`; siembra la
      agente si no existe; delega en `MessageIngestionService.ingest()`; responde
      `{ conversations, messagesIngested, leadsCreated, duplicates }`
- [x] 1.3 Suprimir efectos en vivo para el histórico: verificado que **no requiere código nuevo**
      — las conversaciones nacen `attention_mode='human'` por default de schema (sin override en
      `MessageIngestionService`), y `BotQueue.shouldNotify` exige `attentionMode='bot'`; cubierto
      por el test de la tarea 3.1
- [x] 1.4 `import/import.module.ts` registrado en `AppModule` (reusa `ChannelsModule`/ingestión)

## 2. Frontend: parseo del zip anidado

- [x] 2.1 `api/whatsapp-history.ts`: `parseWhatsAppHistory(file)` con `jszip` — descomprime zip de
      reclutadora → zips de conversación → `.txt`; deriva la agente del nombre de carpeta
      (alias `Dulce→Damaris`)
- [x] 2.2 `chatLeadToInbound(chatLead, agent)`: adapta la salida de `parseWhatsAppChat` a
      `NormalizedInboundMessage[]` (solo entrantes del candidato) con `externalMessageId`
      determinista `wa-hist:{tel}:{epoch}:{hash}` para idempotencia
- [x] 2.3 `ImportModule.tsx`: tarjeta «Historial de WhatsApp (.zip)»; postea en lotes a
      `/api/import/whatsapp-history`; muestra resumen (procesadas, leads, duplicados, omitidas)

## 3. Tests y verificación

- [x] 3.1 Test backend: lote histórico crea persona/conversación/lead con fechas reales;
      re-post idempotente (sin filas nuevas); ningún `bot.notify` encolado
- [~] 3.2 **Omitida**: el frontend no tiene ningún framework de tests instalado (a diferencia
      de `server/`). Instalar tooling nuevo solo para esta función es una decisión de alcance
      de todo el proyecto, no de este change — se decide aparte. La lógica crítica
      (idempotencia, no disparo del bot) ya está cubierta por los 5 tests del backend (3.1); la
      verificación manual con los 386 chats reales (3.3) prueba el adaptador end-to-end.
- [x] 3.3 `server/README.md` (endpoint de importación histórica) + suite completa (27
      archivos / 196 tests) + lint + **verificación manual con datos reales**: importados los
      3 zips (Damaris/Gladys/Hernán, 383 conversaciones con candidato) contra
      `crm_reclutamiento`. Resultado: 313 personas, 322 conversaciones WhatsApp (todas en
      `attention_mode='human'`), 2070 mensajes históricos, 311 leads (304 asignados a su
      reclutadora, 263 con `origin='paid'` por heurística Facebook sin campaña real). Bug
      real encontrado y corregido durante la verificación: mensajes de candidato con `body`
      vacío (stickers/multimedia sin caption) rompían la validación — se filtran en
      `chatLeadToInbound`, igual que hacen los adaptadores en vivo. Re-ejecutar el import
      completo una 2ª vez confirmó idempotencia total: 0 mensajes nuevos, 100% duplicados
