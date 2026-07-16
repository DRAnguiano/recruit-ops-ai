# Design — add-backend-foundation

## Context

Hoy el proyecto es solo una SPA React 19 + Vite ("Torre de Control — Reclutamiento
Transmontes") con datos en IndexedDB y carga manual de chats/CSV/Excel. La arquitectura
objetivo (ver `openspec/project.md` §3 y §6) requiere un backend que reciba webhooks de
WhatsApp Cloud API / Telegram / Messenger / Instagram, sincronice campañas con la Meta
Marketing API e integre un bot LLM externo (FastAPI). Este change construye únicamente la
fundación: proceso NestJS, Postgres con migraciones, BullMQ, event log y convenciones.

## Goals / Non-Goals

**Goals:**
- Backend NestJS arrancable localmente con un comando, con Postgres y Redis en docker-compose.
- Esquema inicial de dominio derivado de `src/types.ts` de la SPA (la estructura ya probada),
  preparado para ingestión multicanal (ids de mensaje por canal, atribución de campaña).
- Event log `domain_events` operativo desde el día 1.
- Patrón de colas BullMQ listo para que los changes siguientes registren workers.
- Convenciones ejecutables: TS estricto, zod en env, errores tipados, tests de humo.

**Non-Goals:**
- Webhooks de canales, envío de mensajes, sync de Marketing API, bot-gateway, WebSockets.
- Tocar la SPA (`src/`) o migrarla fuera de IndexedDB (eso es `add-api-for-spa`).
- Autenticación de usuarios finales (se decidirá en `add-api-for-spa`; aquí solo se deja
  el módulo `identity` como frontera vacía si hace falta).
- Configuración versionada borrador→publicación (se introduce cuando exista el primer
  consumidor real, en `add-configurable-catalogs`).

## Decisions

1. **Monorepo con `server/` junto a `src/`** (la SPA). Alternativa: repo separado —
   rechazada: el contrato API↔SPA evoluciona junto y el equipo es pequeño. El backend tiene
   su propio `package.json` dentro de `server/` para no mezclar dependencias con Vite.
2. **ORM/migraciones: Drizzle ORM + drizzle-kit**. Alternativas: TypeORM (integración NestJS
   nativa pero migraciones frágiles y decoradores pesados), Prisma (excelente DX pero motor
   binario, esquema propio no-TS y peor encaje con transacciones finas). Drizzle da SQL
   explícito, tipos TS puros sin `any` y migraciones versionadas en SQL plano revisables.
3. **Esquema inicial mínimo pero multicanal**: `people` (teléfono E.164 normalizado como
   llave de dedup), `channel_identities` (persona ↔ id de canal: wa_id, telegram chat id,
   PSID de Messenger/IG), `conversations`, `messages` (con `channel`, `external_message_id`
   único por canal para idempotencia, `direction`), `leads` (clasificación, estado, vacante
   detectada, atribución), `campaigns`, `job_vacancies`, `agents`, `operators`, `fleet`,
   `monthly_goals`, `work_schedules`, `domain_events`. Los enums de negocio de la SPA
   (estados, clasificaciones) se modelan como tablas/columnas de texto validadas en dominio,
   no como enums de Postgres, para poder hacerlos configurables después sin migración dura.
4. **`domain_events` append-only**: tabla con `id` (uuid v7 para orden temporal), `type`,
   `aggregate_type`, `aggregate_id`, `actor` (system|user|bot|channel), `payload` JSONB,
   `occurred_at` UTC. Sin UPDATE/DELETE — se garantiza por convención de repositorio (solo
   método `append`) y un trigger que rechaza UPDATE/DELETE. Alternativa: outbox/event
   sourcing completo — sobredimensionado para esta fase.
5. **BullMQ con patrón de registro por módulo**: cada módulo de dominio expone sus colas vía
   un `QueueModule.register()` común; nombres de cola con prefijo de dominio
   (`campaigns.sync`, `channels.outbound`). En este change solo se crea el patrón y una cola
   de ejemplo con test de humo.
6. **Validación de entorno**: un `env.ts` con esquema zod que se ejecuta antes de crear la
   app Nest; el proceso sale con error legible si falta una variable. Todas las variables
   nuevas se documentan en `.env.example`.
7. **Tests con Vitest** (no Jest): mismo runner que puede usarse luego en la SPA, más rápido,
   config TS nativa. Tests de humo: bootstrap de la app, migraciones aplican en DB efímera,
   `domain_events.append` persiste y rechaza mutación, cola BullMQ procesa un job.
8. **Zonas horarias**: todos los timestamps `timestamptz` en UTC. `work_schedules` guarda TZ
   IANA (`America/Mexico_City` como seed) — la lógica de minutos hábiles se portará aquí en
   `add-lead-pipeline`, no en este change.

## Risks / Trade-offs

- [Drizzle es menos "oficial" en NestJS que TypeORM] → integración vía provider propio
  (`DatabaseModule`) de ~50 líneas; sin acoplamiento mágico, fácil de testear.
- [Esquema diseñado antes de ver payloads reales de webhooks] → columnas específicas mínimas
  + `raw_payload` JSONB en `messages` para no perder datos; ajustes de esquema en
  `add-channel-webhooks` son migraciones normales, no rediseño.
- [Monorepo sin workspace tooling] → dos `package.json` independientes (raíz y `server/`);
  si duele, se adopta pnpm workspaces en un change posterior.
- [Trigger anti-mutación en `domain_events` complica dumps/restores] → el trigger se puede
  deshabilitar en migraciones controladas; documentado en el propio SQL.

## Migration Plan

Cambio aditivo puro: no toca la SPA ni datos existentes (IndexedDB vive en los navegadores
de los usuarios, intacto). Rollback = borrar `server/` y docker-compose. El cutover de datos
reales ocurre en changes posteriores.

## Open Questions

- ¿Despliegue objetivo (VPS propio vs. cloud gestionado)? No bloquea la fundación; el
  docker-compose local marca el contrato de infraestructura.
- Naming exacto de estados del funnel al portarlos a backend (hoy la SPA mezcla español en
  valores de datos); se decidirá en `add-lead-pipeline` manteniendo dominio en inglés y UI
  en español.
