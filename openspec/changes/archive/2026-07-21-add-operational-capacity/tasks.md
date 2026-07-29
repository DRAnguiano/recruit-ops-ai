# Tasks — add-operational-capacity

## 1. Schema y migración

- [x] 1.1 `schema.ts`: tabla `circuit_capacity` (`circuit` único, `units`, `unitsInMaintenance`,
      `unitsActive`, `hcAuthorized`, `hcReal`, `deficit`, `snapshotDate`, timestamps)
- [x] 1.2 Migración drizzle `0011_circuit-capacity.sql` + entrada en `meta/_journal.json`;
      aplicada a la DB de tests y a `crm_reclutamiento`, verificada

## 2. Backend: ingestión y lectura

- [x] 2.1 `import/hc-capacity.schemas.ts`: zod del lote (`snapshotDate`, `circuits[]` con
      `circuit`, enteros ≥0, `deficit` entero)
- [x] 2.2 `import/hc-capacity.controller.ts`: `POST /api/import/hc-capacity` (upsert por
      `circuit`) → `{created, updated}`; registrado en `ImportModule`
- [x] 2.3 `GET /api/circuit-capacity` ordenado por déficit desc (en el mismo controller)

## 3. Frontend: parser + tarjeta + vista

- [x] 3.1 `api/hc-capacity.ts`: `parseHcCapacity(file)` con `xlsx` — hoja «HC 2026», detecta
      bloques por `Fecha`+`CIRCUITO`, toma el de fecha máxima, extrae circuitos (ignora `TOTAL`);
      `deficit = hcAuthorized − hcReal`. Columnas resueltas por nombre (robusto ante el desfase
      de la columna A vacía que XLSX omite). Verificado: snapshot 17/07, 9 circuitos correctos
- [x] 3.2 `ImportModule.tsx`: tarjeta «Capacidad HC (.xlsx)»; postea a `/api/import/hc-capacity`;
      resumen (circuitos importados, fecha del snapshot)
- [x] 3.3 `types.ts`: tipo `CircuitCapacity`; `App.tsx` carga `GET /api/circuit-capacity` al boot
      y lo baja a la vista de Capacidad
- [x] 3.4 Sección «Capacidad por circuito» en la vista de Capacidad: tabla por circuito
      (autorizado vs. real, déficit, cobertura), ordenada y resaltada por déficit > 0; déficit
      total en el encabezado; sin tocar el déficit por empresa

## 4. Tests y verificación

- [x] 4.1 Test backend: upsert por circuito crea/actualiza; re-post idempotente; `GET` ordenado
      por déficit
- [x] 4.2 `server/README.md` (endpoints de capacidad) + suite completa (29 archivos / 204 tests)
      + lint + **verificación manual con datos reales**: importado el snapshot 17/07 de la hoja
      HC 2026 (9 circuitos) contra `crm_reclutamiento`. `GET /api/circuit-capacity` devuelve
      ordenado por déficit: MTY 8, Clarios Sencillo 4, Marítimo 3, Bajío 2, Clarios Full/ZF 1,
      Bocar/Nemak/TRC 0 — **déficit total 19**. Idempotencia confirmada (2ª corrida: 0 creados,
      9 actualizados). Parser verificado tomando el snapshot de fecha máxima entre los ~20 bloques
      de la hoja.