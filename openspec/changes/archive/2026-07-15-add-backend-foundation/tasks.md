# Tasks — add-backend-foundation

## 1. Infraestructura local y esqueleto

- [x] 1.1 Crear `docker-compose.yml` (Postgres 16 + Redis 7) y ampliar `.env.example` con las variables del backend
- [x] 1.2 Scaffold NestJS en `server/` con `package.json` propio, TypeScript estricto, scripts dev/build/test (Vitest) y lint
- [x] 1.3 Implementar `env.ts` con esquema zod que valida antes del bootstrap y aborta con mensaje legible
- [x] 1.4 Crear clase de error de dominio tipada (código + mensaje) y filtro HTTP que la serializa sin stack trace
- [x] 1.5 Módulo `health` con GET `/health` reportando proceso, Postgres y Redis

## 2. Persistencia

- [x] 2.1 Integrar Drizzle ORM + drizzle-kit con `DatabaseModule` (provider propio) y comando de migraciones
- [x] 2.2 Migración inicial: `people`, `channel_identities`, `conversations`, `messages` (con `raw_payload` JSONB y unique `channel + external_message_id`), `leads`
- [x] 2.3 Migración de catálogos: `campaigns`, `job_vacancies`, `agents`, `operators`, `fleet`, `monthly_goals`, `work_schedules` (TZ IANA, seed `America/Mexico_City`)
- [x] 2.4 Test de humo: migraciones aplican en DB efímera; unique de idempotencia de mensajes y unique de teléfono E.164 se cumplen

## 3. Event log

- [x] 3.1 Migración `domain_events` (UUID v7, actor, payload JSONB, `occurred_at` UTC) con trigger que rechaza UPDATE/DELETE
- [x] 3.2 Módulo `events` con `DomainEventsService.append` como única vía de escritura y consulta por tipo/agregado/rango temporal
- [x] 3.3 Tests: append persiste, mutación es rechazada por el trigger, consulta por rango ordena por `occurred_at`

## 4. Jobs en background

- [x] 4.1 Módulo compartido de colas BullMQ con patrón `register()` por dominio y nombres prefijados (`dominio.cola`)
- [x] 4.2 Configurar retención de jobs fallidos con su error y logging con nombre de cola + job id
- [x] 4.3 Cola de ejemplo con worker y test de humo end-to-end (encolar → procesar → fallo retenido)

## 5. Cierre

- [x] 5.1 README de `server/` con pasos de arranque desde clone limpio (docker-compose, env, migraciones, dev)
- [x] 5.2 Verificar arranque completo desde cero siguiendo el README y que `npm run lint` y tests pasan en `server/`
