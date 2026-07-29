## Why

El tercer lado de la demo es la **capacidad operativa por circuito**: cuántos operadores están
autorizados vs. cuántos hay realmente en cada circuito, y por tanto el déficit y el cupo que las
campañas deben cubrir. La hoja «HC 2026» del reporte semanal ya trae ese dato limpio: un snapshot
por fecha con los 9 circuitos (TRC, MTY, Bajío Foráneos, ZF, Nemak, Clarios Sencillo/Full, Bocar,
Marítimo Foráneos), sus unidades, HC autorizado y HC real. Hoy la vista de Capacidad solo calcula
déficit por **empresa** (flota vs. operadores activos); no existe la granularidad por circuito que
el negocio usa para decidir dónde reclutar. Este change carga ese snapshot y lo muestra.

## What Changes

- **Modelo nuevo `circuit_capacity`**: una fila por circuito con el snapshot de dotación —
  `units`, `unitsInMaintenance`, `unitsActive`, `hcAuthorized` (total autorizado),
  `hcReal` (total real), `deficit` (= autorizado − real) y `snapshotDate`. Único por circuito
  (un snapshot vigente por circuito); reimportar actualiza.
- **Importador del snapshot HC 2026 en «Cargar datos»**: la SPA parsea la hoja «HC 2026» del
  `.xlsx` (que tiene varios bloques por fecha), toma el **snapshot más reciente**, y por cada
  circuito manda su dotación. El backend hace upsert por circuito.
- **Sección «Capacidad por circuito» en la vista de Capacidad**: sin reemplazar el déficit por
  empresa existente, se agrega una tabla/tarjetas por circuito mostrando autorizado vs. real,
  déficit y cupo, resaltando los circuitos con mayor faltante — la señal de dónde enfocar campañas.

Fuera de alcance: la evolución temporal (serie de snapshots — el usuario eligió solo el snapshot),
las bajas mensuales estructuradas (dependen del modelo de episodios, change mayor), y ligar el
déficit por circuito con las campañas activas de ese circuito (requiere que las campañas tengan
circuito asignado; hoy las pautas no lo traen).

## Capabilities

### New Capabilities

- `operational-capacity`: snapshot de capacidad de dotación por circuito (unidades, HC autorizado
  vs. real, déficit) importado de la hoja HC 2026 y mostrado en la vista de Capacidad, idempotente
  por circuito.

### Modified Capabilities

<!-- Ninguna: la vista de Capacidad gana una sección; el déficit por empresa (fleet) no cambia. -->

## Impact

- **Schema**: tabla nueva `circuit_capacity` (único por `circuit`); migración drizzle aditiva.
- **Backend**: `POST /api/import/hc-capacity` `{snapshotDate, circuits[]}` (upsert por circuito) +
  `GET /api/circuit-capacity` (listado para la vista); servicio/controller nuevos.
- **Frontend**: `api/hc-capacity.ts` (parser de la hoja HC 2026, toma el snapshot más reciente) +
  tarjeta «Capacidad HC (.xlsx)» en `ImportModule.tsx` + sección «Capacidad por circuito» en la
  vista de Capacidad (`App.tsx`).
- **Datos**: se carga el snapshot real (9 circuitos, total 214/233, déficit 18) en
  `crm_reclutamiento` durante la verificación.
- **Dependencias**: ninguna nueva (`xlsx` ya está).
- **Decisión**: el `circuit` se guarda como texto (el nombre del HC 2026), sin FK al catálogo
  `circuits` — los nombres del HC no coinciden con el catálogo sembrado y forzar la FK obligaría a
  reconciliarlos, fuera de alcance.
