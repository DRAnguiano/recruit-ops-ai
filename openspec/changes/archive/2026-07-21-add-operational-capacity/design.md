## Context

La hoja «HC 2026» del `.xlsx` semanal contiene varios bloques, uno por fecha (10/06 … 17/07/2026).
Cada bloque tiene una fila `Fecha`, un encabezado `CIRCUITO | # UNIDADES | MTTO | TOTAL ACTIVAS |
TITULAR AUT | TITULAR REAL | POST AUT | POST REAL | TOTAL AUT | TOTAL HC REAL | DIF`, nueve filas de
circuito y una fila `TOTAL`. El negocio razona por **circuito**: HC autorizado vs. real → déficit,
que indica dónde falta gente. El sistema hoy solo tiene `fleet` (déficit por empresa) y `goals`
(metas), ninguno por circuito con HC autorizado/real. El usuario pidió **solo el snapshot** (no la
serie temporal).

## Goals / Non-Goals

**Goals:**
- Modelar y cargar el snapshot de capacidad por circuito (autorizado, real, déficit).
- Mostrarlo en la vista de Capacidad, resaltando los circuitos con mayor déficit.
- Idempotente por circuito (reimportar actualiza al snapshot más reciente).

**Non-Goals:**
- Serie temporal de snapshots (solo el más reciente).
- Bajas mensuales / episodios laborales (change mayor, modelo inexistente).
- Ligar déficit por circuito ↔ campañas del circuito (las pautas no traen circuito).
- Reconciliar los nombres de circuito del HC con el catálogo `circuits`.

## Decisions

### 1. Tabla nueva `circuit_capacity`, no extender `fleet`/`goals`
`fleet` es por empresa (tractos en servicio/sin operador) y `goals` son metas de contratación —
ninguno modela HC autorizado vs. real por circuito. Se crea una tabla dedicada:
`circuit_capacity(circuit UNIQUE, units, units_in_maintenance, units_active, hc_authorized,
hc_real, deficit, snapshot_date, timestamps)`. Único por `circuit`: un snapshot vigente por
circuito, upsert al reimportar.
- *Alternativa descartada*: meterlo en `fleet` → mezcla dos granularidades (empresa vs. circuito)
  y dos semánticas (flota vs. HC) en una tabla.

### 2. `circuit` como texto, sin FK al catálogo
Los circuitos del HC («BAJIO FORANEOS», «MARITIMO FORANEOS», «CLARIOS SENCILLO»…) no coinciden con
los `name` del catálogo `circuits` sembrado. Forzar la FK obligaría a reconciliar nombres (fuera de
alcance). Se guarda el nombre tal cual del HC; la reconciliación con el catálogo es trabajo futuro.

### 3. El cliente toma el snapshot más reciente
El parser recorre la hoja «HC 2026», detecta cada bloque por su fila `Fecha` + encabezado
`CIRCUITO`, y se queda con el bloque de **fecha máxima**. De ese bloque extrae las 9 filas de
circuito (hasta `TOTAL`, que se ignora). El `deficit` se toma de la columna `DIF` si viene, o se
calcula `hc_authorized − hc_real` (más robusto: la columna DIF a veces está vacía).
- *Por qué en el cliente*: consistente con los otros importadores (chats, pautas); el backend
  recibe filas limpias y solo hace upsert.

### 4. Sección nueva en la vista de Capacidad, sin tocar el déficit por empresa
La vista `capacity` (App.tsx) conserva su déficit por empresa (fleet + operadores). Se agrega
debajo una sección «Capacidad por circuito» que lee `GET /api/circuit-capacity` y muestra, por
circuito, autorizado vs. real, déficit y una barra/orden por mayor faltante. Los circuitos con
déficit > 0 se resaltan (semántica de «dónde reclutar»).

### 5. Upsert idempotente por circuito
`POST /api/import/hc-capacity` recibe `{ snapshotDate, circuits: [{circuit, units,
unitsInMaintenance, unitsActive, hcAuthorized, hcReal, deficit}] }` y upserta por `circuit`
(reemplaza la fila con el snapshot nuevo). Reimportar el mismo archivo deja la tabla igual.

## Risks / Trade-offs

- [El snapshot es una foto puntual; no refleja cambios entre importaciones] → aceptado, el usuario
  eligió snapshot. Reimportar el reporte más reciente actualiza la foto.
- [Nombres de circuito no reconciliados con el catálogo] → la vista muestra el nombre del HC; si a
  futuro se cruza con leads/vacantes por circuito, habrá que mapear nombres (documentado).
- [La columna DIF a veces vacía o con signo distinto al esperado] → se recalcula `autorizado−real`
  para consistencia, ignorando DIF cuando no cuadra.

## Migration Plan

Migración drizzle aditiva: crea `circuit_capacity` (+ único `circuit`). Sin backfill. La carga del
snapshot es verificación manual contra `crm_reclutamiento`, idempotente.

## Open Questions

- Ninguna bloqueante. (Reconciliar circuitos del HC con el catálogo `circuits` y ligar el déficit
  con campañas/vacantes por circuito son mejoras posteriores.)
