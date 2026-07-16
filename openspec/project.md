# CRM de Reclutamiento Omnicanal — Contexto de Producto y Arquitectura

> Documento de contexto vigente (reescrito 2026-07-15; sustituye la versión 2026-07-09, que
> describía un diseño greenfield previo a la existencia de la app actual). Toda propuesta
> OpenSpec (`/opsx:propose`) debe alinearse con este documento. Si un change necesita
> contradecirlo, debe decirlo explícitamente en su `proposal.md` y actualizarse este archivo
> al archivar.

## 1. Punto de partida real

Ya existe una aplicación funcionando: **"Torre de Control — Reclutamiento Transmontes"**,
una SPA de React 19 + Vite (origen AI Studio) que es la base visual y de dominio del producto:

- **Vistas**: Funnel de la Semana, Bandeja de Leads (CRM) con visor de chat, Atribución y
  Contratos (lead → operador contratado), Capacidad y Metas, Rendimiento de Campañas,
  Cobertura y Horarios, Cargar Datos.
- **Modelo de dominio ya probado** (`src/types.ts`): `ChatLead` (con mensajes, clasificación,
  atribución), `MarketingCampaign`, `JobVacancy`, `Operator`, `FleetData`, `MonthlyGoal`,
  `WorkScheduleSettings`.
- **Lógica valiosa** (`src/utils/whatsappParser.ts`): normalización de teléfonos (últimos 10
  dígitos), detección de CTAs de anuncios, clasificación Vacante/RH Interno/Otro, detección
  de tipo de vacante, cálculo de minutos de primera respuesta en horario hábil.
- **Limitaciones actuales**: no hay backend (datos en IndexedDB del navegador) y toda la
  ingestión es manual — ZIPs de chats exportados de WhatsApp, Excel de operadores, CSV de
  campañas y formularios (`src/components/ImportModule.tsx`, `src/utils/fileParsers.ts`).

## 2. Tesis del producto

CRM de reclutamiento operativo (operadores de tráiler/quinta rueda en logística y
transporte), **omnicanal y AI-ready**: los leads llegan solos por webhooks de los canales,
las campañas se miden con datos reales de Meta, y un bot LLM externo puede atender
conversaciones — todo centralizado en un solo sitio: **campañas, chats y datos**.

**La migración central**: eliminar la ingestión manual de chats y sustituirla por canales
nativos conectados por webhook, conservando la UI y el modelo de dominio existentes.

Principio arquitectónico central (vigente):

> Cada decisión operativa la toma un motor determinista del sistema evaluando configuración;
> la IA solo aporta entradas (datos extraídos con evidencia) y salidas (mensajes redactados
> dentro de límites). El CRM es la fuente de verdad: estados, reglas, horarios, historial.

## 3. Decisiones de arquitectura acordadas (2026-07-15)

1. **Backend nuevo NestJS** (monolito modular, TypeScript) + **PostgreSQL** + **Redis/BullMQ**.
   IndexedDB deja de ser el almacenamiento primario; la SPA pasa a consumir la API REST +
   WebSockets del backend. La SPA existente se conserva y se adapta, no se reescribe.
2. **WhatsApp migra a la Cloud API oficial de Meta**. El número de reclutamiento se da de
   alta en la Cloud API: las reclutadoras responden desde el CRM, no desde el teléfono.
   Beneficio clave: los leads de anuncios Click-to-WhatsApp llegan con `referral` del
   anuncio → **atribución de campaña automática y exacta** (reemplaza las heurísticas de CTA).
3. **Canales nativos por webhook**: WhatsApp Cloud API, Facebook Messenger e Instagram
   (los tres bajo una misma app de Meta y un mismo endpoint de webhook con verificación
   `hub.challenge` + firma `X-Hub-Signature-256`), y Telegram Bot API. Todos pasan por un
   `ChannelAdapter` común que normaliza a un modelo de mensaje/conversación único.
4. **Campañas con Meta Marketing API** (token de sistema, permiso `ads_read`): sincronización
   de solo lectura de gasto, clicks y leads reales por campaña. **El CSV de campañas se
   conserva únicamente como fallback/histórico** (es el único import manual que sobrevive).
   Gestión activa (pausar/activar desde el CRM) queda para una fase posterior condicionada a
   App Review de Meta; mientras tanto `pauseRequested` funciona como cola de acciones manuales.
   No se simulan datos: siempre datos reales de cada campaña.
5. **La IA conversacional vive en un servicio externo FastAPI** (propiedad del usuario, fuera
   de este repo). El CRM no llama LLMs directamente: expone un **contrato HTTP versionado**
   hacia el bot — le reenvía eventos de mensaje entrante y recibe respuestas propuestas y
   datos extraídos con evidencia. La elección de proveedor LLM es responsabilidad del
   servicio FastAPI; el CRM valida en backend todo lo que el bot quiera ejecutar (catálogo
   cerrado de acciones) antes de enviarlo al canal.
6. **Event log append-only** (`domain_events`) como fuente de métricas y auditoría desde el
   primer change de backend.
7. **Ciclo de vida de conversación** (revisión 2026-07-15): una conversación se cierra tras
   un periodo de inactividad **configurable** (default 21 días); un mensaje posterior abre
   conversación nueva. Nada se borra: la conversación cerrada conserva su historial.
8. **Media entrante es primera clase**: el LLM del usuario entiende audios, así que los
   mensajes de audio/imagen/documento se persisten con tipo y media id, y un worker (BullMQ)
   descarga el binario de la Graph API a S3/MinIO. La ingestión pasa de síncrona a encolada
   en cuanto exista este I/O de red por mensaje.
9. **Asignación y toggle de bot por conversación**: `conversations.assigned_agent_id` y
   `conversations.attention_mode` (`human`|`bot`) existen desde la fundación; los endpoints
   llegan con la API de la SPA y la semántica de lock (humano toma → bot off) con el
   bot-gateway.
10. **Secrets de infraestructura viven en env** (firma de webhooks, tokens de app): la regla
    "nada hardcodeado" aplica a datos/reglas de negocio, no a credenciales. Los tokens
    por-número/por-canal que el usuario configure desde UI irán cifrados en DB con llave
    maestra en env (llega con `add-configurable-catalogs`).
11. **Conversación ≠ estado de lead** (revisión 2026-07-15b): la conversación tiene ciclo de
    sistema (`open`/`closed`; cierre automático por inactividad y cierre manual desde UI);
    los estados de negocio (nuevo/en proceso/documentos/contratado/…) viven en el **lead**
    y serán catálogo configurable, no enum fijo.
12. **La detección conversacional no crea vacantes**: el parser/IA solo etiqueta interés
    (tipo de operador que el candidato menciona). Las vacantes reales son catálogo
    (`job_vacancies`: tipo, circuito, empresa, cupo) gestionado desde UI y por API.
13. **Metas por periodo configurable** (el usuario trabaja metas semanales): meta por
    empresa + tipo de operador + circuito con periodo semana ISO (default) o mes. La
    contratación registra tipo de operador (full/sencillo/…) y circuito al que entra.
14. **Dinero de campañas en USD**: monto con columna `currency` ISO-4217, default `USD`
    (la moneda real la define la cuenta publicitaria; el sync de Marketing API la trae).
    Se corrige el `spend_mxn` heredado de la SPA.
15. **Campos personalizados**: leads/personas tendrán un diccionario de campos definible
    desde UI (tipo, opciones, requerido) — base también del futuro score auditable.
16. **Horarios personalizados múltiples**: `work_schedules` admite varios horarios con TZ
    IANA propia; las métricas dentro/fuera de horario laboral derivan del event log.

## 4. Restricciones no negociables (vigentes)

- **Nada de negocio hardcodeado**: empresas, vacantes, agentes, criterios, horarios, zonas
  horarias y reglas de campaña/canal/IA son datos configurables desde UI, nunca código.
  (El código actual tiene empresas, agentes y tipos de vacante hardcodeados — la migración
  debe convertirlos en catálogos configurables.)
- **La IA nunca decide**: no avanza a viable/descartado/contratado, no inventa datos ni
  vacantes. Toda acción del bot externo pasa por validación del backend contra un catálogo
  cerrado.
- **La lógica de negocio nunca vive en prompts** ni en el servicio FastAPI: el motor
  determinista del CRM decide; el bot solo conversa y extrae datos con evidencia
  (cita textual + id de mensaje).
- **Configuración versionada**: borrador → publicación inmutable donde aplique.
- **UTC en almacenamiento; TZ IANA del schedule para evaluar horarios**, nunca la del
  servidor. (La lógica de minutos hábiles de `whatsappParser.ts` migra al backend con esta
  regla.)
- **Políticas de canal por diseño**: ventana de 24 h y plantillas aprobadas de WhatsApp
  modeladas como capacidades del canal que el backend impone, no como disciplina del usuario.

## 5. Separación de responsabilidades

| Capa | Responsabilidad |
|---|---|
| **Usuario configura** | Empresas, vacantes, agentes/reclutadoras, metas, flota, horarios, credenciales de canal, mapeo campaña→vacante |
| **Sistema decide** (backend CRM) | Normalización e idempotencia de mensajes, atribución de campaña, clasificación determinista, métricas de respuesta, ventana 24 h, validación de acciones del bot |
| **Bot externo (FastAPI) ejecuta** | Redactar respuestas, extraer datos con evidencia, clasificar intención, señalar handoff a humano |
| **Reclutadora revisa** | Conversaciones en vivo desde el inbox del CRM, estados del lead, decisión final contratado/descartado |

## 6. Módulos del backend (NestJS, por dominio)

1. **channels** — `ChannelAdapter` común; webhooks de Meta (WhatsApp/Messenger/Instagram) y
   Telegram; verificación de firma; envío saliente (texto libre en ventana / plantillas);
   idempotencia por id de mensaje del canal.
2. **conversations** — conversación unificada por persona+canal, mensajes, asignación a
   agente, estado de atención (bot/humano), inbox en tiempo real (WebSockets).
3. **leads** — el `ChatLead` actual evoluciona a persona + candidatura; clasificación
   (Vacante/RH Interno/Otro), tipo de vacante detectado, estados del embudo, dedup por
   teléfono normalizado.
4. **campaigns** — sincronización con Meta Marketing API (job BullMQ periódico), import CSV
   fallback, atribución por `referral`, métricas por campaña/semana ISO.
5. **catalog** — empresas, vacantes (`JobVacancy`), agentes, metas mensuales, flota
   (los catálogos que hoy están hardcodeados o en formularios manuales).
6. **schedules** — horario laboral configurable (TZ IANA), cálculo de minutos hábiles de
   primera respuesta, cobertura por hora/día.
7. **bot-gateway** — contrato HTTP con el servicio FastAPI: entrega de eventos entrantes,
   recepción y validación de respuestas/acciones propuestas, toggle bot/humano por
   conversación.
8. **events** — `domain_events` append-only; base de todas las métricas del dashboard.
9. **operators / attribution** — directorio de operadores (import Excel se mantiene por
   ahora), match lead→operador contratado por teléfono, vinculación manual.

## 7. Qué se elimina, qué se conserva de la app actual

- **Se elimina**: import de ZIPs de chats de WhatsApp (`extractWhatsAppChats`, jszip),
  formularios manuales de leads/chats, IndexedDB como base de datos primaria, backup/restore
  JSON como mecanismo de persistencia, datos seed hardcodeados como fuente de producción.
- **Se conserva y adapta**: todas las vistas de análisis de la SPA, el visor de chat (base
  del inbox en vivo), el modelo de dominio, la lógica de clasificación y minutos hábiles
  (movida al backend con tests unitarios), import CSV de campañas (fallback) e import Excel
  de operadores.

## 8. Riesgos a vigilar

1. **Políticas de Meta**: ventana 24 h, plantillas, calidad del número, App Review para
   permisos elevados (gestión de campañas, Instagram). Diseñar para degradar con gracia.
2. **Migración del número de WhatsApp**: una vez en Cloud API, el teléfono deja de usarse en
   la app de WhatsApp; el inbox del CRM debe estar listo antes del switch (cutover planeado).
3. **Bot externo caído o lento**: el CRM debe seguir operable en modo humano si FastAPI no
   responde (timeouts, circuit breaker, fallback a humano).
4. **Datos personales (LFPDPPP México)**: conversaciones y teléfonos en Postgres — acceso por
   rol, retención configurable.
5. **Atribución**: los leads orgánicos (sin `referral`) siguen necesitando clasificación;
   no perder la cobertura que hoy dan las heurísticas.

## 9. Roadmap por fases

- **F0 — Fundación de backend**: monolito NestJS, Postgres, Redis/BullMQ, env con zod,
  `domain_events`, esquema inicial (personas, conversaciones, mensajes, campañas, catálogos),
  API REST básica. Sin canales aún.
- **F1 — Canales nativos entrantes**: webhook único de Meta (WhatsApp primero) + Telegram;
  normalización vía `ChannelAdapter`; ingestión → lead automático con clasificación y
  atribución por `referral`; la SPA lee de la API (adiós IndexedDB); inbox en vivo básico
  con envío saliente (ventana 24 h + plantillas). **Meta: el número migrado a Cloud API y
  ninguna carga manual de chats.**
- **F2 — Campañas y bot**: sync Marketing API (gasto/clicks/leads reales), CSV fallback,
  dashboard de campañas con datos reales; bot-gateway con el servicio FastAPI (contrato
  versionado, validación, handoff bot↔humano); Messenger e Instagram activos.
- **F3 — Gestión y configuración avanzada**: gestión de campañas desde el CRM (post
  App Review), catálogos 100 % configurables desde UI, score auditable de candidatos,
  documentos, seguimientos/ghosting.

## 10. Secuencia de changes OpenSpec prevista

En orden de dependencia (cada uno atómico, ~12-15 tareas máx.):

1. `add-backend-foundation` — monolito NestJS, Postgres, BullMQ, env zod, `domain_events`, esquema base ✅ (archivado 2026-07-15)
2. `add-channel-webhooks` — endpoint Meta (verificación+firma) y Telegram, `ChannelAdapter`, ingestión idempotente de mensajes ✅
3. `add-lead-pipeline` — mensaje→conversación→lead, clasificación determinista, atribución por `referral`, dedup por teléfono, cierre de conversación por inactividad configurable (default 21 días) ✅
4. `add-media-messages` — persistir audio/imagen/documento con tipo y media id; ingestión pasa a cola BullMQ; worker descarga media de Graph API a S3/MinIO ✅ (archivado 2026-07-15)
5. `add-api-for-spa` — API REST + WebSockets para todas las vistas, asignación de conversaciones y toggle bot/humano; la SPA migra de IndexedDB a la API
6. `add-outbound-messaging` — envío desde el inbox, ventana 24 h, plantillas, estado de entrega
7. `add-campaign-sync` — Meta Marketing API read-only, job periódico, CSV fallback
8. `add-bot-gateway` — contrato con FastAPI (texto y media), validación de acciones, lock atómico bot/humano
9. `add-channels-messenger-instagram` — activar los canales restantes sobre el adaptador
10. `add-configurable-catalogs` — CRUD desde UI y API de: empresas, agentes, vacantes
    (tipo/circuito/cupo), estados de lead, metas por periodo (semanal/mensual) por
    empresa+tipo+circuito, horarios múltiples, reglas de clasificación, moneda por
    campaña y credenciales por canal (cifradas)
11. `add-custom-fields` — diccionario de campos personalizados para leads/personas
    (tipo, opciones, requerido), captura desde UI; precursor del score auditable
12. *(F3)* `add-campaign-management`, `add-scoring`, `add-documents`, `add-followups`

## 11. Stack y convenciones

- **Backend**: TypeScript + NestJS (monolito modular) · PostgreSQL · Redis + BullMQ ·
  S3-compatible para media de mensajes · WebSockets para el inbox.
- **Frontend**: la SPA React 19 + Vite existente (Tailwind 4, recharts, lucide), adaptada.
- **Bot**: servicio FastAPI externo (repo aparte) tras el contrato del `bot-gateway`.
- TypeScript estricto sin `any` · archivos kebab-case · dominio en inglés, UI en español ·
  env vars validadas con zod · errores de dominio tipados · módulos por dominio sin imports
  cruzados salvo interfaces públicas · tests unitarios obligatorios para clasificación,
  minutos hábiles, atribución y validación de acciones del bot.
