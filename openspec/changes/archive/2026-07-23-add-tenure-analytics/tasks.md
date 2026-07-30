# Tasks — add-tenure-analytics

## 1. Backend: agregados

- [x] 1.1 `terminations.controller.ts`: `GET /api/terminations/analytics` — trae todas las filas,
      calcula en memoria: `totalTerminations`, `withValidTenure`, `medianTenureDays`, `milestones`
      (30/60/90: count+pct sobre `withValidTenure`), `byType` (count+pct sobre
      `totalTerminations`), `byCircuit` (count, withinNinety, pctWithinNinety, medianTenureDays;
      solo filas con `circuit` no nulo; ordenado por `pctWithinNinety` desc).

## 2. Frontend

- [x] 2.1 `src/types.ts`: `TerminationAnalytics` (forma de la respuesta del endpoint).
- [x] 2.2 `src/App.tsx`: fetch de `/api/terminations/analytics` en el boot (`Promise.all`), estado
      `terminationAnalytics`.
- [x] 2.3 Sección «Permanencia y Bajas» en la pestaña Atribución y Contratos, junto al registro de
      contrataciones: KPI cards (total bajas, mediana de permanencia, % ≤90 días), tabla de hitos
      30/60/90, desglose por tipo, tabla por circuito (conteo, ≤90 días, %, mediana) ordenada por %
      descendente. Estado vacío si `totalTerminations === 0`.

## 3. Verificación

- [x] 3.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [x] 3.2 Verificación funcional contra `crm_reclutamiento`: confirmar que los hitos/mediana/
      desglose por tipo coinciden con lo ya verificado en `add-employee-terminations` (73/52/52/1,
      mediana ≈96 días), y que el desglose por circuito muestra MTY/Clarios Sencillo con alta
      proporción de baja temprana, consistente con el análisis del usuario.
