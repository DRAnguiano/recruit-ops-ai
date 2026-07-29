## Why

Marketing exporta de Meta Ads las pautas semanales por reclutadora (una hoja por agente:
Hernán, Gladis, Adriana, Dulce), con ~31 campañas reales: gasto (~$1,070 USD), impresiones,
alcance y contactos de mensajes (~1,941 leads reportados por Meta). Hoy no hay forma de
cargarlas: la vista de Campañas ya sabe cruzar campaña↔agente↔leads reales de WhatsApp, pero
está vacía. Cargar estas pautas cierra el tercer lado de la demo (leads + campañas + capacidad)
y permite ver, por agente y su rango de fechas, cuánto se gastó vs. cuántos leads reales llegaron.

## What Changes

- **Importador de pautas de Meta en «Cargar datos»**: la SPA acepta el `.xlsx` exportado de
  Meta Ads (multi-hoja, una por reclutadora), lo parsea con `xlsx` (ya es dependencia) tolerando
  el encoding roto de los encabezados (`campaÃ±a`), y mapea cada fila a una campaña.
- **Agente desde el nombre de la hoja**: `Redes-Grupotm-Gladis` → agente «Gladis»; se aplica el
  mismo alias `Dulce→Damaris` del import de historial; los agentes que aún no existen (p. ej.
  Adriana, que tiene pautas pero no chats) se siembran.
- **Mapeo a `campaigns`** (el modelo ya lo soporta): `name` (nombre del anuncio/campaña),
  `startDate`/`endDate` (Inicio/Fin del informe), `spend` + `currency='USD'` (Importe gastado),
  `leadsReported` (Contactos de mensajes totales de Meta), `targetAgentId` (la reclutadora de la
  hoja). Idempotente por `name` + semana ISO — reimportar no duplica.
- **La vista de Campañas cobra vida**: sin cambios de UI, empieza a mostrar por campaña el gasto,
  los leads reportados por Meta vs. los leads reales detectados en WhatsApp de ese agente, y el
  costo por lead — cruzando con los 311 leads ya cargados.

Fuera de alcance: impresiones/alcance (el modelo `campaigns` no tiene esas columnas; se omiten,
no se inventa esquema), el presupuesto planeado en MXN del texto del nombre (solo se carga el
gasto real en USD), y la jerarquía adset/ad y ofertas versionadas (changes mayores del roadmap).

## Capabilities

### New Capabilities

- `meta-pautas-import`: carga idempotente de las pautas exportadas de Meta Ads (una hoja por
  reclutadora) a `campaigns`, sembrando agentes faltantes y ligando cada campaña a su agente y
  rango de fechas, tolerando el encoding roto del export.

### Modified Capabilities

<!-- Ninguna: `campaigns` y su vista no cambian de contrato; se pueblan por un importador nuevo. -->

## Impact

- **Backend**: endpoint `POST /api/import/meta-pautas` `{campaigns[]}` con agente por nombre;
  siembra agentes faltantes y hace el upsert reutilizando la lógica de `bulk-import` (por `name`
  + `isoWeek`, `source='csv'`). Sin migración.
- **Frontend**: `api/meta-pautas.ts` (parser del xlsx multi-hoja, tolerante a encoding) + tarjeta
  «Pautas de Meta (.xlsx)» en `ImportModule.tsx` + corrección del cruce en `CampaignsView.tsx`
  (cuando la campaña no tiene vacante, cuenta todos los leads del agente en vez de defaultear a
  un tipo que los descarta — necesario para cumplir el requirement 3 del spec).
- **Datos**: se cargan las 31 campañas reales en `crm_reclutamiento` durante la verificación; la
  carpeta `Cargar datos/` ya está en `.gitignore`.
- **Dependencias**: ninguna nueva (`xlsx` ya está).
- **Decisión de leads reportados**: se usa «Contactos de mensajes totales» de Meta como
  `leadsReported` (personas que iniciaron conversación), no la columna «Resultados» (que según el
  objetivo de campaña a veces cuenta impresiones/interacciones, inflando el número).
