# add-channels-messenger-instagram — Proposal

## Why

Los leads también escriben por Facebook Messenger e Instagram DM (las campañas de Meta
enlazan a ambos), pero hoy el webhook de Meta solo procesa WhatsApp: los eventos
`object=page` / `object=instagram` se ACKean y se tiran. Toda la maquinaria necesaria ya
existe y es agnóstica de canal (adaptadores, ingestión idempotente, pipeline de leads,
media, outbound, ventana, bot gateway); activar los dos canales restantes es implementar
sus piezas específicas sobre las interfaces existentes — exactamente el change 9 de la
secuencia (project.md §10).

## What Changes

- **Adaptadores entrantes**: `object=page` → canal `messenger`, `object=instagram` →
  canal `instagram` (mismo endpoint Meta ya autenticado por HMAC). Parsean
  `entry[].messaging[]`: texto, adjuntos (audio/imagen/video/archivo) como media refs,
  `referral` (ads click-to-Messenger / m.me ref) para atribución de campaña, y descartan
  echoes/eventos sin mensaje. Identidad por PSID/IGSID (sin teléfono: la persona se crea
  solo con la channel identity, como ya permite el modelo).
- **Descarga de media**: en Messenger/IG los adjuntos llegan como URL firmada del CDN,
  no como media id — el downloader guarda el binario desde esa URL vía el pipeline
  `channels.media` existente (la URL nunca se persiste como media servible; el binario sí).
- **Envío saliente**: `MessengerSender` / `InstagramSender` vía Send API
  (`POST {graph}/{META_PAGE_ID}/messages`, token de página). Texto libre dentro de la
  ventana de 24 h (misma política que WhatsApp, generalizada); plantillas siguen siendo
  exclusivas de WhatsApp → `TEMPLATES_NOT_SUPPORTED` en estos canales. Sin env
  configurada → `CHANNEL_NOT_CONFIGURED`, como hoy.
- **Sin cambios en SPA, bot gateway ni pipeline de leads**: todo lo demás es agnóstico
  de canal y funciona solo (inbox ya filtra por canal; el bot recibe/actúa igual).

## Capabilities

### New Capabilities

- `meta-messaging-channels`: canales Messenger e Instagram end-to-end — parseo entrante
  (texto, adjuntos, referral), identidad PSID/IGSID sin teléfono, descarga de media por
  URL de CDN y envío saliente por Send API con token de página.

### Modified Capabilities

- `whatsapp-window-policy`: la ventana de 24 h se generaliza a política de ventana de
  mensajería de Meta — aplica también a `messenger` e `instagram` (texto libre solo
  dentro de 24 h del último entrante; fuera de ventana no hay fallback de plantillas en
  estos canales).
- `outbound-messaging`: el catálogo de canales enviables crece con `messenger` e
  `instagram` (texto); enviar plantilla por un canal no-WhatsApp responde 409
  `TEMPLATES_NOT_SUPPORTED`.

## Impact

- **Env nuevas (opcionales)**: `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` (compartidas por
  Messenger e Instagram: la cuenta IG va conectada a la página).
- **Código**: `channels/adapters/meta-messaging.adapter.ts` (parser compartido + clases
  por canal), downloader por URL, senders, ruteo en `webhooks.controller`, ventana
  generalizada en `outbound.service`. Sin migraciones de schema.
- **Specs**: 1 nueva + 2 deltas MODIFIED.
- La SPA ya muestra ambos canales (el tipo `ChannelName` los incluye desde el origen).
