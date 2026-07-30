## Why

`add-employee-terminations` cargó las 178 bajas históricas (tipo, fecha de ingreso/baja,
permanencia calculada) pero hoy solo existen como filas crudas vía `GET /api/terminations` — nada
las resume. El análisis operativo del usuario (§14-15) es explícito sobre por qué esto importa: casi
la mitad de las bajas ocurre dentro de los primeros 90 días, y el análisis por circuito muestra que
MTY y Clarios Sencillo concentran tanto el déficit actual (`enhance-circuit-capacity-view`) como una
proporción alta de bajas tempranas — «conseguir más operadores sin corregir las causas de salida
puede alimentar una cubeta con agujeros». Sin esta vista, nadie puede ver ese patrón.

## What Changes

- **`GET /api/terminations/analytics`**: agregados calculados sobre las bajas ya cargadas —
  - Hitos de permanencia: bajas dentro de 30/60/90 días (conteo y %) sobre las que tienen
    permanencia calculable, más la mediana global.
  - Desglose por tipo (renuncia voluntaria / abandono / rescisión / pensión-incapacidad): conteo y %.
  - Desglose por circuito: bajas con fecha válida, bajas ≤90 días, % y mediana de permanencia —
    mismo criterio que la tabla §15 del análisis del usuario.
- **Sección «Permanencia y Bajas»** en la pestaña Atribución y Contratos (junto al registro de
  contrataciones ya existente — cierra el ciclo contratación→baja en el mismo lugar): KPIs de
  resumen, tabla de hitos, desglose por tipo, tabla por circuito ordenada por mayor proporción de
  baja temprana. Estado vacío si no hay bajas cargadas.

Fuera de alcance: normalizar `BOS`/`Submotivo Baja` (motivos frecuentes con variantes de escritura,
ya señalado como no resuelto en el change anterior); cualquier alerta o recomendación automática —
esto es solo lectura descriptiva, no decide nada.

## Capabilities

### Modified Capabilities

- `employee-terminations`: agrega agregados de permanencia (hitos 30/60/90, por tipo, por circuito)
  sobre los datos ya cargados, y su presentación en la SPA.

## Impact

- **Backend**: `terminations.controller.ts` (nuevo endpoint de agregados, calculado en memoria sobre
  las ~178 filas — sin SQL crudo). **Sin migración, sin tabla nueva.**
- **Frontend**: `src/types.ts`, `src/App.tsx` (fetch + sección nueva en Atribución y Contratos).
