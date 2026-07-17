# Tasks — migrate-spa-to-api

## 1. Backend (menor)

- [x] 1.1 Filtro `personId` en `GET /api/conversations` (+ test); SPA en puerto 5173
      (el 3000 lo ocupa Chatwoot — verificar puertos con `docker ps` antes de asignar)

## 2. Capa API de la SPA

- [x] 2.1 `src/api/client.ts`: fetch tipado (`VITE_API_BASE_URL` default
      `http://localhost:3001`), errores `{code,message}`, `fetchAllPages` por cursor
- [x] 2.2 `src/api/mappers.ts`: diccionarios EN↔ES (status, clasificación, tipo de
      vacante, origen, modalidad, estados de operador/campaña/vacante) + mapeo lead→
      `ChatLead`, operador, campaña, flota, meta, vacante, horario; teléfonos E.164↔10 dígitos
- [x] 2.3 `src/api/realtime.ts`: cliente WS con reconexión (backoff) y suscripción por
      tipo de evento

## 3. App.tsx sobre la API

- [x] 3.1 Carga inicial desde API (leads, operadores, campañas, flota, metas, vacantes,
      horario/settings); eliminar `db.ts`, `defaultData.ts` y seeding; estado de error de
      conexión visible
- [x] 3.2 Escrituras de lead → `PATCH /api/leads/:id` y vínculo operador →
      `POST /api/leads/:id/operator` (con mapper inverso y estado desde la respuesta)
- [x] 3.3 Escrituras de catálogo → API (vacantes, flota, metas, horario, settings)
- [x] 3.4 Visor de chat real: conversaciones por persona + mensajes paginados, media
      reproducible, composer con ventana (`canSendFreeform`) y envío por API
- [x] 3.5 Integrar WS: refetch debounced de leads y del hilo abierto ante
      `message.received` / `lead.*` / `conversation.*`

## 4. Imports

- [x] 4.1 `ImportModule`: Excel de operadores → `/api/operators/bulk`, CSV de campañas →
      `/api/campaigns/bulk` (mostrar `{created,updated}`); eliminar ZIP de WhatsApp,
      backup JSON y borrado local con aviso de webhooks

## 5. Cierre

- [x] 5.1 `vite build` + suite backend en verde; verificación manual E2E: webhook con
      audio → lead visible en UI en vivo → abrir chat → reproducir audio → responder
      desde el composer → delivery visible; README raíz actualizado (arranque SPA+backend)
