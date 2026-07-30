## Why

Punto 2 de la secuencia acordada tras `add-employment-episode-hire-record`: cargar las bajas
históricas y sentar la base de permanencia. El análisis operativo del usuario (§14-15) reporta 177
bajas entre enero y junio 2026, con mediana de 98 días hasta la baja y casi la mitad ocurriendo
dentro de los primeros 90 días — información crítica para decidir dónde y cómo reclutar, que hoy no
existe en el sistema (el modelo actual solo tiene `operators.status='leaving'`, sin fecha, motivo ni
tipo de baja).

El archivo fuente (`Base presentación Semanal 2026.xlsx`) trae 8 hojas mensuales/semanales con las
bajas, formato inconsistente entre hojas (orden de columnas distinto, solo la hoja de enero trae
número de empleado) y con solape real: verificado que las hojas semanales `Bajas Sem03/Sem042026`
duplican registros ya presentes en las hojas mensuales de enero. Deduplicando por (nombre
normalizado, fecha de baja) se obtienen **178 registros únicos** — casi exacto a los 177 del
análisis del usuario.

La mayoría de las personas dadas de baja **ya no están** en el directorio de operadores vigente (582
registros hoy): por eso este change no depende de `employment_episodes` (que asume un operador
vigente) — es un import independiente, con vínculo opcional y nunca inventado a un operador si existe.

## What Changes

- **Nueva tabla `terminations`**: un registro por baja histórica, con los datos crudos del reporte
  (nombre, circuito, fecha de ingreso, fecha de baja, tipo de baja normalizado, motivo corto,
  submotivo, comentario) más `tenureDays` (permanencia, calculada en la carga) y un vínculo opcional
  a `operators` cuando el emparejamiento es unívoco (por número de empleado si está disponible, si
  no por nombre exacto normalizado) — nunca adivinado si es ambiguo o no hay coincidencia.
- **Tipo de baja normalizado** a 4 categorías estables detectadas en los datos reales (insensible a
  acentos/mayúsculas): `renuncia_voluntaria`, `abandono_trabajo`, `rescision_contrato`,
  `pension_incapacidad`. Si el texto de origen no calza con ninguna, se guarda solo el texto crudo,
  sin forzar una categoría.
- **Import** (`POST /api/import/terminations`): recibe el lote ya parseado por el cliente (8 hojas
  combinadas), dedupe por `(nombre_normalizado, fecha_baja)` — reimportar no duplica.
- **Lectura** (`GET /api/terminations`): lista las bajas para uso posterior (analítica de
  permanencia 30/60/90, desglose por tipo/circuito — change siguiente).
- **Card nueva en «Cargar Datos»**: sube el Excel, parsea las 8 hojas relevantes, reporta
  creados/duplicados omitidos.

Fuera de alcance (change siguiente): analítica de permanencia 30/60/90 días, desglose por tipo y por
circuito, vista en la SPA — este change es solo el cimiento de datos, análogo a cómo
`add-employment-episode-hire-record` fue el cimiento de contratación.

## Capabilities

### New Capabilities

- `employee-terminations`: registro histórico de bajas con motivo/tipo normalizado, permanencia
  calculada y vínculo opcional (nunca inventado) a un operador vigente.

## Impact

- **Backend**: `schema.ts` (tabla), migración `0015`, `terminations.schemas.ts`,
  `terminations.controller.ts` (import + lectura), evento de dominio.
- **Frontend**: `src/api/terminations.ts` (parser de las 8 hojas), card en `ImportModule.tsx`.
- **Datos**: se importan las bajas históricas contra `crm_reclutamiento` (≈178 registros).
  **Migración aditiva** (tabla nueva). **Sin dependencias nuevas.**
