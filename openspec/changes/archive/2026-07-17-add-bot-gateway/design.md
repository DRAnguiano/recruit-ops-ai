# add-bot-gateway — Design

## Context

El bot es un FastAPI externo (propiedad del usuario; ya entiende audio vía RAG). El CRM
ya tiene: ingestión encolada con post-commit hooks, envío saliente validado
(OutboundService, ventana 24 h, actor en eventos), `attentionMode` por conversación con
toggle humano, y media descargada en storage servida por `GET /api/messages/:id/media`.
Falta el puente en ambos sentidos, con la regla dura: **la lógica de negocio nunca vive
en prompts; el bot solo conversa y extrae datos con evidencia**.

## Goals / Non-Goals

**Goals:**

- Notificar al bot cada mensaje entrante de conversaciones en modo bot (texto y media).
- Aceptar del bot solo el catálogo cerrado: responder, extraer datos con evidencia,
  pedir handoff.
- Lock bot/humano sin carreras: la toma humana gana siempre.

**Non-Goals:**

- Implementar el lado FastAPI (repo aparte; este change publica el contrato v1).
- Resúmenes/score/decisiones de la IA (F3): `extract_data` solo persiste evidencia.
- Plantillas para el bot (el bot responde texto libre dentro de la ventana; si la ventana
  expiró, su send falla con `WINDOW_EXPIRED` y le toca pedir handoff).

## Decisions

### 1. Contrato v1 explícito y versionado en la URL

CRM→bot: POST `BOT_WEBHOOK_URL` con JSON
`{ contractVersion: 1, event: 'message.received', conversation: {id, channel,
attentionMode, canSendFreeform, windowExpiresAt}, person: {id, name, phone}, lead:
{id, classification, detectedVacancyType, status}, message: {id, type, body, sentAt,
mediaUrl?} }`. Bot→CRM: POST `/bot/v1/actions` con
`{ contractVersion: 1, actions: [...] }` (máx. 5 por request). Subir de versión = nueva
ruta `/bot/v2/...`; v1 no se rompe.

### 2. Autenticación simétrica por HMAC del cuerpo crudo

Ambas direcciones firman el body con `BOT_SHARED_SECRET` (HMAC-SHA256, header
`X-Bot-Signature`, mismo patrón que Meta, timing-safe). Sin secret configurado:
notificaciones deshabilitadas (log) y `/bot/v1/actions` responde 403. La media se
comparte como URL absoluta al endpoint existente (red confiable, igual que la API; auth
de plataforma llegará como change propio).

### 3. Notificación vía cola `bot.notify`, enganchada post-commit de la ingestión

La ingestión ya emite post-commit por mensaje; ahí se encola `bot.notify` (jobId =
messageId) SOLO si la conversación está en modo bot y el gateway configurado. El worker
arma el payload (incluye ventana ya calculada) y hace el POST con reintentos
exponenciales (5); agotados → log de error y job failed retenido — la ingestión y el
inbox jamás se ven afectados (regla: fallo del bot ≠ fallo del CRM).

### 4. Acciones ejecutan servicios existentes, nunca lógica propia

- `send_message {conversationId, body}` → `OutboundService.createOutbound` +
  `enqueueOutbound`, con `actor='bot'` en `message.sent`. Reusa TODA la validación
  (conversación abierta, canal configurado, ventana). Precondición adicional atómica:
  `UPDATE conversations SET updated_at=now() WHERE id=$1 AND attention_mode='bot'` — si
  no afecta filas → 409 `BOT_NOT_ACTIVE` (lock, decisión 5).
- `extract_data {conversationId, fields: [{key, value, evidence: {quote, messageId}}]}` →
  valida que cada `messageId` exista en esa conversación y que `quote` sea substring del
  body del mensaje (evidencia verificable, regla §4); persiste evento
  `lead.data_extracted` (actor bot) con los campos. No muta el lead: los campos
  configurables llegan con add-custom-fields y leerán estos eventos.
- `request_handoff {conversationId, reason}` → `attentionMode='human'` + evento
  `conversation.attention_mode_changed` (actor bot, payload con reason) → visible en vivo
  por WS.

Respuesta: `{ results: [{action, ok, error?}] }` por acción (el bot decide reintentar);
acciones desconocidas o payload inválido → 400 `VALIDATION_ERROR` global.

### 5. Lock atómico en la escritura, no en la lectura

La verificación `attentionMode='bot'` como condición del UPDATE (no un SELECT previo)
elimina la carrera humano-toma vs bot-envía: si la reclutadora cambió el modo un
milisegundo antes, el UPDATE del bot no matchea y su send se rechaza. El toggle humano
(`POST /api/conversations/:id/attention-mode`) no cambia — ya emite evento y el bot se
entera porque sus sends empiezan a fallar con `BOT_NOT_ACTIVE` (y puede re-consultar).

## Risks / Trade-offs

- **[Media por URL sin auth]** igual que toda la API en F1 (red confiable + ngrok con
  token del usuario); la auth de plataforma cubrirá también `/bot/*`.
- **[Bot lento]** la notificación es fire-and-forget con cola; la conversación sigue
  visible para humanos en el inbox todo el tiempo.
- **[Evidencia por substring]** exigir `quote ⊆ body` es estricto (falla con audios sin
  transcripción local) → para mensajes de media se permite `quote` vacío con
  `messageId` válido (la evidencia es el audio mismo).

## Migration Plan

Aditivo puro: sin migraciones de schema. Deploy normal; sin env del bot todo queda como
hoy.

## Open Questions

- Ninguna bloqueante. La URL real del FastAPI (o su túnel ngrok) la configura el usuario.
