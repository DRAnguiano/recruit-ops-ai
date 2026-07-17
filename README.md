# Torre de Control — CRM/ATS de Reclutamiento Omnicanal

CRM de reclutamiento operativo (operadores de tráiler / quinta rueda) con canales nativos
por webhook (WhatsApp Cloud API, Telegram), pipeline determinista de leads, envío desde el
inbox y tiempo real. **La SPA consume la API del backend — no hay datos locales.**

- **Frontend**: React 19 + Vite (`src/`) — vistas de Funnel, Leads CRM con visor de chat en
  vivo, Atribución, Capacidad, Campañas, Cobertura, Cargar Datos y Administración.
- **Backend**: NestJS + PostgreSQL + Redis/BullMQ (`server/`) — ver `server/README.md`.
- **Workflow**: OpenSpec Driven Development (`openspec/`), contexto en `openspec/project.md`.

## Arranque local

Requisitos: Node 22+, Docker.

```bash
# 1. Infraestructura (Postgres 16 + Redis 7)
docker compose up -d --wait

# 2. Backend
cp .env.example .env          # ajustar credenciales de canales si se tienen
cd server && npm install && npm run db:migrate && npm run dev   # → http://localhost:3001

# 3. Frontend (en otra terminal, desde la raíz)
npm install && npm run dev    # → http://localhost:5173
```

La SPA apunta por default a `http://localhost:3001`; se cambia con `VITE_API_BASE_URL`.
Sin backend accesible, la UI muestra un banner de error de conexión (nunca datos falsos).

## Cómo llegan los datos

- **Chats**: webhooks de los canales (`/webhooks/meta`, `/webhooks/telegram`) — nada que
  importar; cada mensaje crea/actualiza su lead y aparece en vivo (WebSocket `/ws`).
- **Operadores**: Excel de RH → vista Cargar Datos → upsert idempotente por `# Emp`.
- **Campañas**: Meta Marketing API (change futuro `add-campaign-sync`); mientras tanto CSV
  de respaldo → upsert por nombre + semana ISO.
- **Catálogos** (vacantes, flota, metas, horario, reclutadoras): formularios de la UI → API.
- **Catálogos de dominio** (empresas, circuitos, tipos de vacante, estados de lead),
  metas por periodo y settings operativos: vista **Administración** → API (nunca hardcodeado).

## Tests

```bash
cd server && npm test    # suite completa del backend (necesita docker compose arriba)
npx tsc --noEmit         # typecheck de la SPA (desde la raíz)
```
