# Tasks — add-bot-gateway

## 1. Base

- [x] 1.1 Env `BOT_WEBHOOK_URL` / `BOT_SHARED_SECRET` (zod + `.env.example`) y helper
      HMAC compartido (firmar y verificar `X-Bot-Signature`, timing-safe)

## 2. CRM → bot

- [x] 2.1 `BotNotifierService`: arma el payload v1 (conversación+ventana, persona, lead,
      mensaje con `mediaUrl`) y hace el POST firmado
- [x] 2.2 Cola `bot.notify` (jobId=messageId, 5 reintentos exponenciales) enganchada
      post-commit de la ingestión SOLO para conversaciones en modo bot con gateway
      configurado; fallo agotado → log + job failed retenido

## 3. Bot → CRM

- [x] 3.1 Guard HMAC del bot + `POST /bot/v1/actions` (zod: contractVersion 1, máx 5
      acciones del catálogo cerrado; resultados por acción)
- [x] 3.2 `send_message` vía OutboundService con `actor='bot'` + lock atómico
      (`UPDATE … WHERE attention_mode='bot'` → 409 `BOT_NOT_ACTIVE`)
- [x] 3.3 `extract_data` con evidencia verificable (messageId de la conversación; quote
      substring del body en textos; quote vacío permitido en media) → evento
      `lead.data_extracted` sin mutar el lead
- [x] 3.4 `request_handoff` → `attentionMode='human'` + evento actor=bot con reason

## 4. Tests y cierre

- [x] 4.1 Tests e2e con fake bot HTTP: notificación firmada con mediaUrl al ingerir en
      modo bot; silencio en modo humano; bot caído no rompe ingestión
- [x] 4.2 Tests e2e de acciones: send con actor=bot y ventana; `BOT_NOT_ACTIVE` en
      carrera con toma humana; evidencia falsa rechazada; extracción válida auditada;
      handoff visible por WS; firma inválida 403
- [x] 4.3 README (`server/`: contrato v1 completo para implementar el lado FastAPI) +
      suite completa + lint + verificación manual (fake bot ↔ CRM ciclo completo)
