# Tasks — add-channels-messenger-instagram

## 1. Entrante

- [x] 1.1 Env `META_PAGE_ID` / `META_PAGE_ACCESS_TOKEN` (zod opcionales + `.env.example`)
- [x] 1.2 `meta-messaging.adapter.ts`: parser compartido de `entry[].messaging[]`
      (texto, adjuntos→media refs con URL de CDN, referral→sourceId, descarte de
      echoes/eventos sin mensaje) + clases `MessengerAdapter` / `InstagramAdapter`
- [x] 1.3 Ruteo en `webhooks.controller`: `object=page` → messenger,
      `object=instagram` → instagram (encolar como los demás canales)
- [x] 1.4 Tests de adapter: texto, adjunto de audio, referral con `ad_id`, echo ignorado,
      delivery/read ignorados

## 2. Media

- [x] 2.1 `MetaCdnMediaDownloader` (fetch directo a la URL firmada, sin token; límite de
      tamaño existente) registrado para messenger e instagram
- [x] 2.2 Test e2e: webhook messenger con adjunto → binario almacenado vía cola; URL
      caída → media `failed` tras reintentos

## 3. Saliente

- [x] 3.1 `MessengerSender` / `InstagramSender` (Send API `/{META_PAGE_ID}/messages`,
      `messaging_type: RESPONSE`, token de página) registrados en `OutboundService`
- [x] 3.2 Ventana generalizada: `WINDOWED_CHANNELS` (whatsapp, messenger, instagram) en
      ventana y detalle de conversación; plantilla en canal no-WhatsApp → 409
      `TEMPLATES_NOT_SUPPORTED`
- [x] 3.3 Tests e2e: ingesta messenger → persona sin teléfono + lead atribuido por
      referral; send dentro de ventana (fake Send API) → `sent`; fuera de ventana →
      `WINDOW_EXPIRED`; plantilla → `TEMPLATES_NOT_SUPPORTED`; sin env →
      `CHANNEL_NOT_CONFIGURED`; bot gateway notifica igual en canal messenger

## 4. Cierre

- [x] 4.1 README (tabla de canales/env; sección Messenger/IG) + suite completa + lint +
      verificación manual (webhook firmado `object=page` → inbox → respuesta vía fake
      Send API)
