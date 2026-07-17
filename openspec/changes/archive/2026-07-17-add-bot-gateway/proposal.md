# add-bot-gateway — Proposal

## Why

El LLM del usuario (servicio FastAPI externo, ya corriendo con RAG y comprensión de
audio) todavía no puede atender conversaciones: el CRM no le notifica mensajes entrantes
ni le acepta respuestas. La arquitectura acordada (project.md §3.5) es un **contrato HTTP
versionado**: el CRM reenvía eventos de mensaje al bot y valida en backend todo lo que el
bot quiera ejecutar contra un **catálogo cerrado de acciones** — la IA nunca decide ni
toca estados de negocio.

## What Changes

- **Notificación al bot** (CRM → FastAPI): cuando llega un mensaje entrante a una
  conversación con `attentionMode='bot'`, un job (`bot.notify`, reintentos) hace POST a
  `BOT_WEBHOOK_URL` firmado con HMAC (`BOT_SHARED_SECRET`) con el mensaje normalizado
  (texto, tipo, y URL de descarga del binario de media para los audios). Sin env
  configurada, el gateway queda deshabilitado; un fallo del bot jamás afecta la ingestión.
- **Catálogo cerrado de acciones** (FastAPI → CRM), `POST /bot/v1/actions` autenticado
  por HMAC: `send_message` (pasa por el MISMO pipeline de envío saliente con
  `actor='bot'`, ventana 24 h incluida), `extract_data` (datos con evidencia obligatoria
  — cita textual + id de mensaje — persistidos como evento `lead.data_extracted`; nunca
  cambia estados), y `request_handoff` (pasa la conversación a humano). Cualquier otra
  acción → 400. El bot NUNCA avanza estados de lead ni inventa vacantes.
- **Lock atómico bot/humano**: el bot solo puede enviar mientras
  `attentionMode='bot'` — la validación es un UPDATE condicional atómico, así una toma
  humana simultánea gana siempre; el intento del bot recibe 409 `BOT_NOT_ACTIVE`.
  El toggle humano existente sigue siendo la única vía de encender el bot.

## Capabilities

### New

- `bot-gateway`: notificación firmada CRM→bot con reintentos y media accesible.
- `bot-actions`: endpoint de acciones con catálogo cerrado, validación y auditoría
  (`actor='bot'`).
- `attention-lock`: semántica de lock atómico bot/humano.

## Impact

- **Env nuevas (opcionales)**: `BOT_WEBHOOK_URL`, `BOT_SHARED_SECRET`.
- **Código**: módulo `bot` nuevo; hook en la ingestión (post-commit) para encolar la
  notificación; sin cambios de schema (la evidencia vive en `domain_events`).
- **Sin cambios en la SPA**: el toggle bot/humano ya existe en el inbox.
- El servicio FastAPI (repo aparte) implementará el contrato v1 contra esta spec;
  el ngrok/public-gateway ya corriendo puede exponer los webhooks para probar real.
