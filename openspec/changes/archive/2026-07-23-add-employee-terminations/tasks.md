# Tasks — add-employee-terminations

## 1. Esquema y migración

- [x] 1.1 `schema.ts`: tabla `terminations` (operatorId nullable FK, matchedBy, employeeNameRaw,
      employeeNameNormalized, empNoRaw, circuit, hireDate, terminationDate NOT NULL,
      terminationType, terminationTypeRaw, terminationCategory, reasonShort, reasonDetail, comment,
      tenureDays, sourceSheet, timestamps) con UNIQUE(employeeNameNormalized, terminationDate).
- [x] 1.2 Migración `server/drizzle/0015_terminations.sql` + entrada en `meta/_journal.json`.

## 2. Parser del cliente

- [x] 2.1 `src/api/terminations.ts`: parsea las 8 hojas «Bajas <Mes/Sem>» resolviendo columnas por
      nombre (nombre interno, num empleado opcional, circuito, fecha ingreso, fecha baja, nom
      motivo baja, clasificacion de baja, bos, submotivo baja, comentario baja); normaliza nombre
      (mayúsculas, espacios colapsados); normaliza tipo de baja a las 4 categorías (insensible a
      acento/mayúscula), con crudo de respaldo si no calza; calcula `tenureDays`.

## 3. Backend: import + lectura

- [x] 3.1 `terminations.schemas.ts`: zod del payload de import.
- [x] 3.2 `terminations.controller.ts`: `POST /api/import/terminations` — matching a operador
      (empNo si existe, si no nombre exacto unívoco), `INSERT ... ON CONFLICT
      (employee_name_normalized, termination_date) DO NOTHING`, evento
      `termination.imported` con conteos.
- [x] 3.3 `GET /api/terminations` en el mismo controller.
- [x] 3.4 Módulo/DI: registrar el controller (patrón `HcCapacityController`, sin módulo nuevo si no
      hace falta).

## 4. Frontend: carga

- [x] 4.1 `ImportModule.tsx`: card «Bajas históricas» — parsea el Excel, arma el payload, hace
      `POST /api/import/terminations`, muestra creados/omitidos.

## 5. Verificación

- [x] 5.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [x] 5.2 Aplicar la migración; importar contra `crm_reclutamiento`; confirmar ≈178 registros
      únicos, desglose de tipo ≈80/58/54/2, idempotente en 2ª corrida, y contar cuántos quedaron
      vinculados a un operador vigente (minoría esperada).
