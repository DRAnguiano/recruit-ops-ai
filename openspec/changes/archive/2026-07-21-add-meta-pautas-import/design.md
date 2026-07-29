## Context

El export de Meta Ads viene como `.xlsx` con una hoja por reclutadora
(`Redes-Grupotm-Junio julioHernan`, `Redes-Grupotm-Gladis`, `Redes-Grupotm-Adriana`,
`Redes-Grupotm-Dulce`). Las columnas relevantes están presentes en todas pero con
**encabezados heterogéneos** (unas dicen «Nombre del anuncio», otras «Nombre de la
campaÃ±a» con mojibake) y **orden variable**. Los datos de performance son reales (gasto,
impresiones, contactos de mensajes), aunque algunas filas están en cero (campañas que no
entregaron). El modelo `campaigns` ya tiene todo lo necesario: `name`, `startDate`,
`endDate`, `spend`, `currency`, `leadsReported`, `targetAgentId`; y la vista de Campañas ya
cruza campaña↔agente↔leads. El importador existente de campañas (`parseCampaignsCSV` +
`/api/campaigns/bulk`) espera un CSV distinto y no siembra agentes.

## Goals / Non-Goals

**Goals:**
- Cargar las pautas reales a `campaigns`, ligadas a su agente y rango de fechas, idempotente.
- Tolerar el encoding roto y el orden variable de columnas del export.
- Sembrar agentes que tengan pautas pero no chats (Adriana).

**Non-Goals:**
- Impresiones/alcance (el modelo no los tiene; se omiten sin inventar esquema).
- Presupuesto planeado en MXN (vive solo en el texto del nombre; se carga el gasto real USD).
- adset/ad, ofertas versionadas, enfoque creativo A/B (changes mayores del roadmap).

## Decisions

### 1. Resolución de columnas por coincidencia laxa, no por nombre exacto
El parser normaliza cada encabezado (minúsculas, sin acentos, colapsando el mojibake) y
localiza las columnas por subcadena: «importe gastado»→spend, «inicio del informe»→startDate,
«fin del informe»→endDate, «nombre del anuncio» ó «nombre de la camp»→name, «contactos de
mensajes tot»→leadsReported. Así una hoja «anuncio» y otra «campaña» se mapean igual, y el
mojibake de los encabezados no rompe nada. Si falta una columna obligatoria (name), la fila se
reporta como error, no se inventa.
- *Alternativa descartada*: mapear por posición fija de columna → el orden varía entre hojas.

### 2. Agente desde el nombre de la hoja, sembrado si falta
`Redes-Grupotm-<Nombre>` → se extrae `<Nombre>` (quitando el prefijo y el sufijo de mes), se
aplica el alias `Dulce→Damaris` (reutilizando `agentFromFolderName`/el diccionario del import de
historial), y el backend siembra el agente si no existe — igual que
`add-whatsapp-history-import`. Así Adriana (pautas sin chats) entra al catálogo.

### 3. Endpoint dedicado que recibe el agente por nombre
`POST /api/import/meta-pautas` recibe `{ campaigns: [{ agent, name, startDate, endDate, spend,
leadsReported }] }`. Resuelve/siembra el agente por nombre, deriva `isoWeek` de `startDate`, y
hace el upsert **reutilizando `BulkImportService.upsertCampaigns`** (por `name`+`isoWeek`,
`source='csv'`). Se prefiere sobre reusar `/api/campaigns/bulk` directamente porque ese endpoint
exige `targetAgentId` como uuid ya resuelto y no siembra agentes; el endpoint dedicado mantiene
la lógica de identidad de agente en un solo lugar, consistente con el import de historial.
- *Nota*: `upsertCampaigns` se extiende mínimamente para aceptar `targetAgentId` en el upsert
  (hoy no lo setea); es aditivo y no cambia el comportamiento del import CSV existente.

### 4. `leadsReported` = contactos de mensajes, no «Resultados»
La columna «Resultados» de Meta cambia de significado según el objetivo de la campaña (a veces
alcance/impresiones, con valores de miles) — usarla infla `leadsReported`. «Contactos de
mensajes totales» son las personas que abrieron conversación = leads reportados por Meta, que es
justo lo que la vista compara contra los leads reales de WhatsApp. Se usa esa columna.

### 5. Idempotencia por `name` + semana ISO
Sin `externalId` numérico de Meta en el export, la dedup es por `name`+`isoWeek` (misma llave
que el import CSV existente). Los nombres de campaña son descriptivos y únicos
(«TO HERNAN| Sem.13,14| $500MXN»); reimportar el mismo archivo no duplica.

## Risks / Trade-offs

- [Filas con spend=0 (campañas no entregadas)] → se cargan igual (son campañas reales que
  existieron); la vista muestra costo por lead 0, que es correcto para una campaña sin gasto.
- [Dos hojas con el mismo nombre de campaña en semanas distintas] → la llave `name`+`isoWeek`
  las mantiene separadas mientras el `startDate` caiga en semanas ISO distintas; si coincidieran,
  se tratarían como la misma (upsert) — aceptable para pautas semanales.
- [Impresiones/alcance perdidos] → documentado; agregarlos al modelo es un change aparte si el
  negocio los quiere en el análisis.

## Migration Plan

Sin migración de esquema. La carga de las 31 pautas es un paso de verificación manual contra
`crm_reclutamiento`, idempotente (re-ejecutable).

## Open Questions

- Ninguna bloqueante.
