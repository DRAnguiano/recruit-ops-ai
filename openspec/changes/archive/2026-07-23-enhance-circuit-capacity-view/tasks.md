# Tasks — enhance-circuit-capacity-view

## 1. Backend

- [x] 1.1 `schema.ts`: `circuitCapacity` += `sourceDeficit: integer('source_deficit')` (nullable).
- [x] 1.2 Migración `server/drizzle/0014_circuit-capacity-source-deficit.sql` (ADD COLUMN) + entrada
      en `meta/_journal.json`.
- [x] 1.3 `hc-capacity.schemas.ts`: `circuitCapacitySchema` += `sourceDeficit: z.number().int().nullable().optional()`.
- [x] 1.4 `hc-capacity.controller.ts`: persistir `sourceDeficit` (null si no viene) sin usarlo para
      calcular `deficit`.

## 2. Frontend: parser + tipo

- [x] 2.1 `src/api/hc-capacity.ts`: `columnsFrom` resuelve la columna «DIF» (`colOf(header,
      ['dif'])`); si existe, extraer su valor crudo como `sourceDeficit` por circuito (null si la
      columna no está presente en el bloque).
- [x] 2.2 `src/types.ts`: `CircuitCapacity` += `sourceDeficit: number | null`.

## 3. Tabla de capacidad por circuito (src/App.tsx)

- [x] 3.1 Columna **Participación**: `deficit / Σ(deficit>0) × 100` para circuitos con déficit
      positivo; «—» para los que no tienen faltante.
- [x] 3.2 Indicador de discrepancia en la fila cuando `sourceDeficit !== null && sourceDeficit !==
      deficit` («fuente reporta distinto, validar con Operaciones»), sin hardcodear el circuito.

## 4. Verificación

- [x] 4.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [x] 4.2 Aplicar la migración; re-ejecutar el import contra `crm_reclutamiento` (snapshot 17/07) y
      confirmar `sourceDeficit` poblado para los 9 circuitos, idempotente en 2ª corrida.
- [x] 4.3 Confirmar en la tabla: participación calculada correctamente (suma 100% entre circuitos
      con déficit) y que ZF muestra el indicador de discrepancia (fuente=0, calculado=1) mientras
      los demás circuitos no lo muestran.
