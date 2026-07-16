# add-backend-foundation

## Why

La app actual es una SPA sin backend: todos los datos viven en IndexedDB del navegador y la
ingestión de chats es 100 % manual (ZIPs de WhatsApp, CSV, formularios). La migración a
canales nativos (WhatsApp Cloud API, Telegram, Messenger, Instagram) exige recibir webhooks
y sincronizar campañas con la Meta Marketing API, y nada de eso puede existir sin un backend
con persistencia real. Este change crea esa fundación, primer paso de la secuencia definida
en `openspec/project.md` §10.

## What Changes

- Se crea el backend NestJS (monolito modular TypeScript) en `server/`, con módulos por
  dominio y fronteras explícitas (sin imports cruzados salvo interfaces públicas).
- Se configura PostgreSQL con migraciones versionadas como único mecanismo de cambio de
  esquema, y el esquema inicial del dominio: personas/leads, conversaciones, mensajes,
  campañas, vacantes, agentes, operadores, flota, metas y horario laboral — derivado de los
  tipos ya probados en `src/types.ts` de la SPA.
- Se configura Redis + BullMQ como infraestructura de jobs en background (la usarán el sync
  de campañas y los envíos salientes en changes posteriores).
- Se implementa el event log append-only `domain_events`: API interna para emitir eventos
  inmutables con actor, payload y timestamp UTC — base de auditoría y métricas.
- Arranque validado: variables de entorno validadas con zod; el proceso no arranca con
  configuración inválida. Clase de error de dominio tipada. Health check.
- Entorno local reproducible: docker-compose con Postgres y Redis; scripts de desarrollo.
- Runner de tests (Vitest) con tests de humo de la fundación.
- **No incluye**: webhooks de canales, API para la SPA, envío de mensajes, sync de campañas
  ni bot-gateway — son los changes siguientes de la secuencia. La SPA no se toca en este
  change (**BREAKING** vendrá en `add-api-for-spa`, cuando abandone IndexedDB).

## Capabilities

### New Capabilities

- `backend-foundation`: esqueleto NestJS, validación de entorno con zod, errores de dominio
  tipados, health check, entorno docker-compose y convenciones ejecutables.
- `data-persistence`: PostgreSQL con migraciones versionadas y el esquema inicial del
  dominio de reclutamiento (leads, conversaciones, mensajes, campañas, catálogos).
- `domain-events`: event log append-only `domain_events` con API interna de emisión y
  consulta, timestamps UTC.
- `background-jobs`: Redis + BullMQ con patrón único de registro de colas/workers por módulo.

### Modified Capabilities

<!-- Ninguna: no existen specs previos; este es el primer change del backend. -->

## Impact

- Código nuevo: directorio `server/` (backend NestJS completo), `docker-compose.yml`,
  `.env.example` ampliado con variables de backend.
- La SPA existente (`src/`) no se modifica en este change; sigue funcionando con IndexedDB
  hasta `add-api-for-spa`.
- Dependencias nuevas: NestJS, driver de Postgres + herramienta de migraciones, BullMQ,
  ioredis, zod, Vitest.
- Sistemas: requiere Postgres y Redis locales (docker-compose) y en el despliegue futuro.
