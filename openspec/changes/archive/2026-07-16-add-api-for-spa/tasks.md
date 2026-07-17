# Tasks — add-api-for-spa

## 1. Base transversal

- [x] 1.1 Env `CORS_ALLOWED_ORIGINS` (zod, default dev) + `.env.example`; prefijo global `/api` (excluyendo `/health` y `/webhooks/*`) y CORS en `main.ts`
- [x] 1.2 `ZodValidationPipe` en `common/` con error 400 `{ code: 'VALIDATION_ERROR', message, issues }`; 404 tipado para recursos inexistentes
- [x] 1.3 Utilidad de paginación keyset en `common/` (cursor opaco base64, `{ items, nextCursor }`) con tests unitarios

## 2. Inbox API

- [x] 2.1 Módulo `conversations`: `GET /api/conversations` (filtros + paginación por `lastMessageAt`) y `GET /api/conversations/:id` con persona y asignación
- [x] 2.2 `GET /api/conversations/:id/messages` paginado por `sentAt` con tipo y estado de media
- [x] 2.3 Comandos: asignar/desasignar agente, toggle `attentionMode`, cierre manual — validaciones y `domain_events` con `actor='user'`
- [x] 2.4 `GET /api/messages/:id/media`: streaming desde `MediaStorage` con mime almacenado; 404 tipado si no está `stored`
- [x] 2.5 Tests e2e del inbox: listados, filtros, comandos, media y errores

## 3. Leads API

- [x] 3.1 `GET /api/leads` (filtros + paginación) y `GET /api/leads/:id` con métricas, campaña y operador
- [x] 3.2 `PATCH /api/leads/:id` (status/notes/agente/clasificación con `classificationSource='human'`) + link/unlink de operador; eventos `actor='user'`
- [x] 3.3 Tests e2e de leads incluyendo que el pipeline no pisa el override humano

## 4. Catalog API

- [x] 4.1 Módulo `catalog`: CRUD de campañas, vacantes, agentes, operadores, flota, metas, horarios y reglas de clasificación; deletes referenciados fallan con error tipado; eventos de auditoría
- [x] 4.2 Settings operativos (`GET/PUT` de claves validadas, ej. `conversation_inactivity_days`) reutilizando `SettingsService`
- [x] 4.3 Bulk upserts transaccionales e idempotentes: `POST /api/operators/bulk` (por `empNo`) y `POST /api/campaigns/bulk` (por `externalId` o nombre+isoWeek, `source='csv'`)
- [x] 4.4 Tests e2e de catálogos: CRUD, delete referenciado, settings y doble import bulk sin duplicados

## 5. Tiempo real

- [x] 5.1 Suscripción in-process en el módulo `events` (interfaz pública) publicando tras persistir cada evento
- [x] 5.2 Gateway WS en `/ws` (`@nestjs/platform-ws`): difusión `{ type, payload }` de los eventos del inbox, fire-and-forget ante clientes caídos
- [x] 5.3 Tests: cliente WS recibe `message.received` al ingerir y `message.media_stored` al completar descarga; un socket roto no afecta la ingestión

## 6. Cierre

- [x] 6.1 README de `server/` (endpoints, paginación, WS, env nueva) y verificación completa: lint + suite + prueba manual (webhook → evento visible por WS y por REST)
