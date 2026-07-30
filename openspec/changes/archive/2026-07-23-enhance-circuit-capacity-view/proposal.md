## Why

Auditando la pestaña «Capacidad y Metas» contra el documento de análisis operativo del usuario
(§4 «Situación operativa de HC»): la tabla por circuito ya está correcta y es más reciente que el
documento (snapshot 17/07 cargado vs. el corte 13/07 del análisis) — verificado cifra por cifra
contra el Excel fuente. Se confirmó la única discrepancia real que el propio documento ya señalaba:
en **ZF** la fuente reporta `DIF=0` explícitamente, pero aritméticamente `9 autorizado − 8 real = 1`
— nuestro sistema, que siempre calcula el déficit (más robusto que confiar en la columna DIF del
reporte), muestra 1. El documento marca esto como pendiente de validar con Operaciones, no como un
error nuestro.

El usuario decidió: (1) mantener el déficit calculado (no el de la fuente) en todos los circuitos,
pero señalar visualmente cuándo diverge del valor que la fuente reporta, para que se note sin
adivinar cuál es «correcto»; y (2) agregar una columna de participación (% del déficit total que
representa cada circuito), dato que el documento ya calcula (§4 «Participación de la necesidad») y
que ayuda a priorizar (MTY/Bajío/Clarios Sencillo concentran hoy la mayor parte del déficit).

## What Changes

- **Captura el «DIF» de la fuente por separado**: nueva columna `sourceDeficit` en
  `circuit_capacity` — el valor crudo de la columna DIF del reporte HC 2026, cuando está presente.
  No sustituye a `deficit` (que sigue siendo siempre `hcAuthorized − hcReal`, calculado); es un
  dato de referencia para detectar divergencias, genérico (no hardcodeado a un circuito).
- **Parser del cliente**: además de «Total Aut»/«Total HC Real», resuelve la columna «DIF» por
  nombre y la envía como `sourceDeficit` (null si el reporte no la trae).
- **Tabla de capacidad por circuito**: nueva columna **Participación** (% del déficit total del
  circuito), y un indicador visual «⚠ fuente reporta distinto, validar con Operaciones» en la fila
  donde `sourceDeficit` no coincide con el `deficit` calculado.
- Se re-ejecuta el import contra `crm_reclutamiento` para poblar `sourceDeficit` de los 9 circuitos.

Fuera de alcance: decidir cuál valor (calculado vs. fuente) es el «correcto» — eso requiere
validación humana con Operaciones, como el propio documento indica; secciones de Flota/Metas
mensuales (siguen vacías por falta de datos, correctamente ocultas).

## Capabilities

### Modified Capabilities

- `operational-capacity`: el snapshot por circuito conserva también el déficit tal como lo reporta
  la fuente (cuando existe), para poder señalar divergencias con el calculado; la vista agrega
  participación (%) por circuito.

## Impact

- **Backend**: `schema.ts` (columna nueva), migración `0014`, `hc-capacity.schemas.ts`,
  `hc-capacity.controller.ts` (persistir el campo nuevo).
- **Frontend**: `src/api/hc-capacity.ts` (parser), `src/types.ts`, `src/App.tsx` (tabla).
- **Datos**: migración aditiva (columna nullable); re-import idempotente contra `crm_reclutamiento`.
  **Sin dependencias nuevas.**
