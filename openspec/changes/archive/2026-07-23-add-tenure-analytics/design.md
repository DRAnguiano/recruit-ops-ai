## Context

`terminations` (178 filas cargadas) ya tiene `tenureDays` (calculado al importar), `terminationType`
(4 categorías normalizadas) y `circuit` (texto crudo del reporte, igual que `circuit_capacity`).
Dataset pequeño (178 filas) — no justifica agregación en SQL; se computa en memoria en el backend,
igual criterio que `computeMedianResponseTime` (mediana de respuesta) ya usa en el frontend para un
dataset de tamaño similar.

## Goals / Non-Goals

**Goals:** hitos de permanencia (30/60/90), desglose por tipo, desglose por circuito con mediana;
visibles en la pestaña Atribución y Contratos.

**Non-Goals:** normalizar motivos (`BOS`/`Submotivo Baja`); alertas/recomendaciones automáticas;
cruzar con `circuit_capacity` o `employment_episodes` (el propio análisis del usuario ya hace esa
lectura manualmente; cruzarlo en código es un salto de alcance no pedido aquí).

## Decisions

### 1. Agregación en memoria, un solo endpoint
`GET /api/terminations/analytics` trae todas las filas de `terminations` una vez y calcula en JS:
mediana (mismo patrón: ordenar, tomar el/los valor(es) central(es)), hitos (`tenureDays <= 30/60/90`
sobre filas con `tenureDays` no nulo), agrupación por `terminationType` y por `circuit` (se excluyen
filas sin circuito de esa tabla, no se inventa un circuito). Un único round-trip, sin SQL crudo.

### 2. Circuito: texto crudo, igual criterio que `circuit_capacity`
`terminations.circuit` no tiene FK al catálogo `circuits` (mismos nombres inconsistentes ya
documentados en `operational-capacity`). El desglose por circuito agrupa por el texto tal cual viene
del reporte — no se intenta mapear a un catálogo en este change.

### 3. Ubicación: pestaña Atribución y Contratos, junto al registro de contrataciones
Mismo lugar donde vive el «Registro de contrataciones (inmutable)» de `employment_episodes` — cierra
el ciclo de vida laboral completo (contratación → baja) en una sola pestaña, sin agregar un tab
nuevo a la navegación.

### 4. Ordenar el desglose por circuito por % de baja temprana, no por conteo
Coincide con el criterio del análisis del usuario («la señal más importante está en los circuitos
con proporción alta de bajas tempranas»): el circuito con mayor `% ≤90 días` aparece primero, no el
de más bajas en términos absolutos.

## Risks / Trade-offs

- **Circuitos con muestra pequeña** (p. ej. 1-2 bajas) pueden mostrar % extremos (0% o 100%) sin
  significancia estadística — se muestra el conteo junto al %, igual que hace el análisis del
  usuario («Clarios Full y ZF tienen muestras demasiado pequeñas para concluir»); no se oculta el
  dato, se deja al lector juzgar con el conteo visible.
- **Solo bajas con `hireDate`** entran a hitos/mediana (23% de las 178 podrían no tener fecha de
  ingreso) — correcto, no se inventa una permanencia sin ambas fechas.
