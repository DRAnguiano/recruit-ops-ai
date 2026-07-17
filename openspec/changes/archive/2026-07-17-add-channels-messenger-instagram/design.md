# add-channels-messenger-instagram — Design

## Context

El endpoint `POST /webhooks/meta` ya autentica por HMAC y rutea por `payload.object`:
`whatsapp_business_account` se procesa; `page` (Messenger) e `instagram` se ACKean con un
log. Todas las interfaces por canal existen y tienen dos implementaciones (whatsapp,
telegram): `ChannelAdapter` (entrante), `MediaDownloader` (binarios), `ChannelSender`
(saliente). `ChannelName` incluye `messenger` e `instagram` desde el origen, así que DB,
API, SPA, bot gateway y pipeline de leads no necesitan cambios.

## Goals / Non-Goals

**Goals:**

- Ingerir mensajes de Messenger e Instagram (texto + adjuntos + referral de ads).
- Descargar y almacenar sus adjuntos por el pipeline `channels.media` existente.
- Enviar texto saliente por Send API respetando la ventana de 24 h.

**Non-Goals:**

- Estados de entrega/lectura de Messenger/IG (los eventos `delivery`/`read` usan
  watermarks, no mids — modelo distinto al de WhatsApp; se ACKean sin efecto y llegarán
  como change propio si se necesitan).
- Nombre de perfil del remitente (requiere llamada extra a la Graph API por PSID;
  la persona se crea sin nombre y la reclutadora puede editarla).
- Plantillas/message tags fuera de ventana (Meta no tiene plantillas aprobadas tipo
  WhatsApp para estos canales; fuera de ventana simplemente no se puede enviar).
- Historias de IG, reacciones, postbacks de botones (se ACKean sin persistir, como los
  stickers de WhatsApp).

## Decisions

### 1. Un parser compartido, dos clases de canal

`entry[].messaging[]` tiene el mismo shape en `page` e `instagram` (sender.id,
message.mid, message.text, message.attachments, referral). Un helper
`parseMetaMessaging(payload, channel)` produce los `NormalizedInboundMessage`; dos
`@Injectable` finos (`MessengerAdapter`, `InstagramAdapter`) fijan `channel` y cumplen
`ChannelAdapter`. El controller rutea: `object=page` → messenger, `object=instagram` →
instagram. Se descartan `message.is_echo` (mensajes propios reflejados) y eventos sin
`message` (delivery/read/postback) — ACK sin efecto, política existente.

### 2. Identidad por PSID/IGSID, persona sin teléfono

`externalUserId = sender.id` (PSID de página / IGSID). No hay teléfono ni nombre en el
webhook: `phoneE164` y `senderName` van null y la ingestión existente ya crea la persona
solo con su channel identity (mismo camino que Telegram sin contacto compartido). La
dedup entre canales por teléfono no aplica hasta que la reclutadora lo capture — correcto:
no se inventan datos.

### 3. Media ref = URL firmada del CDN; downloader sin token

Los adjuntos llegan como `attachments[].payload.url` (URL firmada de lookaside/CDN), no
como media id. `InboundMediaRef.externalId` guarda esa URL y un
`MetaCdnMediaDownloader` (instanciado por canal) hace `fetch` directo sin auth — la firma
va en la URL. Mapa de tipos: `audio→audio`, `image→image`, `video→video`, `file→document`;
otros (`share`, `fallback`, stickers) se ignoran. La URL expira: por eso la descarga es
inmediata vía la cola existente con reintentos, y si expiró el job termina `failed`
re-encolable (mismo contrato que WhatsApp). `mediaUrl` servida al bot sigue siendo la
interna (`/api/messages/:id/media`), nunca la del CDN.

### 4. Send API con env de página compartida

`MessengerSender` e `InstagramSender` hacen
`POST {GRAPH_API_BASE_URL}/{META_PAGE_ID}/messages` con
`{ recipient: {id}, messaging_type: 'RESPONSE', message: {text} }` y
`access_token=META_PAGE_ACCESS_TOKEN` (la cuenta IG profesional va conectada a la página;
mismo token con permiso `instagram_manage_messages`). `isConfigured()` exige ambas env;
sin ellas → `CHANNEL_NOT_CONFIGURED` antes de persistir, como hoy. `externalMessageId` =
`message_id` de la respuesta.

### 5. Ventana de 24 h generalizada como política Meta

`OutboundService` hoy pregunta `channel === 'whatsapp'` para aplicar ventana. Pasa a un
set `WINDOWED_CHANNELS = {whatsapp, messenger, instagram}` sobre la misma función de
ventana (24 h desde el último entrante, `canSendFreeform`/`windowExpiresAt` en el
detalle). Diferencia por canal: fuera de ventana WhatsApp ofrece plantillas; en
messenger/instagram una petición de plantilla (dentro o fuera de ventana) responde 409
`TEMPLATES_NOT_SUPPORTED` y el texto fuera de ventana responde `WINDOW_EXPIRED` sin
alternativa. Telegram sigue sin ventana.

## Risks / Trade-offs

- **[URL de CDN expirada antes de descargar]** cola con reintentos inmediatos minimiza la
  ventana; si expira, `failed` visible y auditable (no hay re-resolución posible sin
  media id — límite de la plataforma).
- **[Persona sin nombre en el inbox]** se muestra el canal + id externo hasta que un
  humano capture nombre/teléfono; preferible a inventar datos o llamadas extra por
  mensaje.
- **[Token de página único]** si el usuario gestiona varias páginas, esto se queda corto —
  las credenciales por canal/empresa cifradas en DB llegan en `add-configurable-catalogs`
  (decisión ya tomada, project.md §3.8); estas env son el puente.
- **[IG y Messenger comparten ruta de envío]** si Meta divergiera los endpoints, los
  senders ya son clases separadas; solo cambiaría la URL interna.

## Migration Plan

Aditivo puro: sin migraciones de schema ni cambios de contrato existentes. Sin env nuevas
configuradas, todo queda exactamente como hoy (los objects se ACKean… pero ahora
ingiriendo; la descarga de media CDN no necesita token, así que funciona de inmediato).

## Open Questions

- Ninguna bloqueante. Registrar la página/IG en el panel de webhooks de Meta (campos
  `messages`, `messaging_referrals`) lo hace el usuario cuando exponga el backend
  (ngrok ya disponible).
