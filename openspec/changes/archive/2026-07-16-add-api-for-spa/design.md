# add-api-for-spa — Design

## Context

El monolito NestJS ya tiene todos los datos que las vistas de la SPA necesitan (schema de
`add-backend-foundation` + pipeline de `add-lead-pipeline` + media de `add-media-messages`),
pero solo expone `/health` y los webhooks. La SPA sigue sobre IndexedDB. Este change agrega
la capa de lectura/escritura HTTP y el canal de tiempo real; la migración del frontend es el
change siguiente (`migrate-spa-to-api`).

Restricciones relevantes: dominio en inglés (la UI traduce), errores de dominio tipados,
env con zod, módulos por dominio sin imports cruzados salvo interfaces públicas, y "la IA
nunca decide" (aquí: los endpoints de comando son para humanos; el bot tendrá su propio
gateway validado en `add-bot-gateway`).

## Goals / Non-Goals

**Goals:**

- API REST completa para las vistas existentes de la SPA (inbox, bandeja de leads,
  campañas, capacidad/metas, cobertura, catálogos y settings).
- Acciones operativas: asignación de conversación, toggle bot/humano, cierre manual,
  overrides humanos del lead.
- Tiempo real: los clientes del inbox ven mensajes nuevos sin recargar.
- Conservar los imports que sobreviven (Excel de operadores, CSV de campañas) como
  endpoints bulk: el navegador parsea, el backend persiste.

**Non-Goals:**

- Envío de mensajes salientes (ventana 24 h, plantillas) → `add-outbound-messaging`.
- Autenticación/autorización de usuarios del CRM: la API nace para despliegue en red
  confiable; auth es prerequisito de exposición pública y llegará como change propio.
- Migrar la SPA (→ `migrate-spa-to-api`) y endpoints agregados de métricas: las vistas
  seguirán computando métricas en el cliente a partir de los listados, como hoy.
- Contrato para el bot FastAPI (→ `add-bot-gateway`).

## Decisions

### 1. Controladores dentro de cada módulo de dominio, no un módulo `api` aparte

Cada módulo de dominio (`conversations` — nuevo, hoy la lógica vive en `channels`/`leads` —,
`leads`, `campaigns`, `catalog`…) expone sus propios controladores y DTOs. Un módulo `api`
central obligaría a imports cruzados de internals, violando la convención. Lo transversal
(pipe de validación zod, filtro de errores, paginación) vive en `common/`.

Nota de estructura: no se crea un módulo NestJS por cada tabla de catálogo; un solo
`catalog` module agrupa campañas, vacantes, agentes, operadores, flota y metas (CRUD plano
sin lógica), mientras `conversations` y `leads` sí son módulos con comandos y eventos.

### 2. WebSockets con `@nestjs/platform-ws` (`ws`), no socket.io

El caso de uso es difusión unidireccional servidor→clientes de eventos JSON. El WebSocket
nativo del navegador basta; socket.io agregaría un cliente propio y framing propietario a
cambio de features (rooms, acks) que no se necesitan. Mensajes: `{ type, payload }` con los
mismos nombres de evento del dominio (`message.received`, `lead.updated`, …). La
reconexión es responsabilidad del cliente (la SPA la implementará en su change).

### 3. Fan-out de eventos in-process desde `DomainEventsService`

El gateway WS necesita enterarse de cada evento de dominio. Alternativas: Redis pub/sub,
LISTEN/NOTIFY de Postgres, o un emitter in-process. Como el sistema es un monolito de un
solo proceso (workers BullMQ incluidos), `DomainEventsService.append()` publica además en
un `EventEmitter` interno al que el gateway se suscribe vía interfaz pública del módulo
`events`. Trade-off asumido: si algún día hay múltiples réplicas, esto migra a Redis
pub/sub sin cambiar el contrato WS.

### 4. Validación con zod en un `ZodValidationPipe` propio

Convención del proyecto: zod, no class-validator. Cada endpoint declara su schema de
entrada; el pipe valida y tipa. Errores de validación responden 400 con la forma estable
de error (`{ code: 'VALIDATION_ERROR', message, issues }`), consistente con el
`DomainErrorFilter` existente.

### 5. Paginación keyset, no offset

Listados grandes (conversaciones, leads, mensajes) paginan por cursor opaco
(`?limit=&cursor=`) sobre orden estable (`lastMessageAt DESC, id` para conversaciones;
`sentAt ASC, id` para mensajes; `createdAt DESC, id` para leads). Respuesta:
`{ items, nextCursor }`. Offset se descarta: se desalinea con inserciones en vivo (inbox).
Los catálogos chicos (agentes, flota, metas, vacantes, horarios, reglas) devuelven lista
completa sin paginar.

### 6. La API habla el dominio en inglés; la UI traduce

Los valores expuestos son los del schema (`new|in_progress|documents|hired|discarded|
no_response`, `local|foreign`, `human|bot`…). El mapeo a etiquetas en español
(Nuevo/En proceso/…) es responsabilidad de la SPA. Evita duplicar catálogos de traducción
en el backend y prepara los estados configurables futuros.

### 7. Media servida por streaming con el `MediaStorage` existente

`GET /api/messages/:id/media` resuelve la fila, exige `media.status=stored`, y streamea el
binario con `Content-Type` del mime almacenado y `Content-Disposition: inline`. No se
exponen rutas de filesystem ni URLs firmadas (el storage local no las tiene); cuando el
storage sea S3 se podrá redirigir a URL firmada sin cambiar el contrato.

### 8. Escrituras humanas emiten eventos con `actor='user'`

Toda mutación por API (asignar, toggle, cerrar, editar lead, CRUD de catálogos) emite su
`domain_event` con `actor: 'user'`, distinguible de `system`/`channel`. La corrección de
clasificación marca `classification_source='human'`, que el pipeline ya respeta (no pisa
overrides humanos).

### 9. Upserts bulk idempotentes para los imports que sobreviven

`POST /api/operators/bulk` (llave natural `empNo`) y `POST /api/campaigns/bulk` (llave
`externalId` o nombre+isoWeek para CSV) hacen upsert por lote dentro de una transacción y
reportan `{ created, updated }`. Reimportar el mismo archivo es no-op seguro.

## Risks / Trade-offs

- **[API sin auth]** Cualquiera con acceso de red lee conversaciones → se documenta como
  para red confiable; CORS restringido por `CORS_ALLOWED_ORIGINS`; auth planeada antes de
  exposición pública.
- **[Emitter in-process]** Eventos WS se pierden si el proceso se reinicia o si hay más de
  una réplica → aceptable para F1 (un proceso); la SPA re-consulta al reconectar; migración
  futura a Redis pub/sub ya prevista (Decisión 3).
- **[Sin endpoints agregados de métricas]** Vistas como Funnel descargan listados completos
  de leads → aceptable al volumen actual (miles, no millones); si duele, se agregan
  endpoints agregados sobre `domain_events` en un change posterior sin romper contrato.
- **[Catálogo `catalog` monolítico]** CRUD plano de muchas tablas en un módulo → riesgo de
  crecer lógica ahí; mitigación: cualquier tabla que gane reglas de negocio se extrae a su
  módulo (como ya pasó con `leads`).

## Migration Plan

Aditivo puro: no hay cambios de esquema ni de contratos existentes. Deploy normal; rollback
= volver a la versión anterior. La SPA no se toca en este change.

## Open Questions

- Ninguna bloqueante. La forma exacta del cursor (base64 de `[valor, id]`) y la lista
  definitiva de eventos WS se fijan en los specs/implementación.
