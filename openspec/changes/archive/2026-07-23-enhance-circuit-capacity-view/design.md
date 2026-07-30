## Context

`circuit_capacity` (operational-capacity) guarda `hcAuthorized`/`hcReal`/`deficit`, con `deficit`
siempre recalculado `hcAuthorized − hcReal` en el backend (`hc-capacity.controller.ts:43`,
comentario: «más robusto que la columna DIF del reporte»). El reporte HC 2026 sí trae una columna
`DIF` propia que hoy el parser (`src/api/hc-capacity.ts`) ni siquiera lee. Verificado contra el
Excel: para 8 de 9 circuitos el DIF de la fuente coincide con `hcAuthorized − hcReal`; en **ZF** la
fuente dice `DIF=0` pero `9−8=1`. El documento de análisis del usuario ya señala esto como pendiente
de validar con Operaciones.

## Goals / Non-Goals

**Goals:** conservar el DIF de la fuente como dato de referencia (sin usarlo para calcular);
señalar divergencia de forma genérica (cualquier circuito, no solo ZF); mostrar participación (%)
en el déficit total.

**Non-Goals:** decidir qué valor es «correcto»; auto-resolver la discrepancia; tocar Flota/Metas.

## Decisions

### 1. `sourceDeficit` nullable, separado de `deficit`
`deficit` sigue siendo siempre calculado (ninguna lógica existente cambia — regla de robustez ya
decidida). `sourceDeficit` es puramente informativo: el valor crudo de la columna DIF cuando el
reporte la trae. Si el reporte no tiene esa columna (versiones antiguas), queda `null` y no se
muestra ninguna advertencia — no se inventa una fuente que no existe.

### 2. Divergencia detectada en el frontend, sin hardcodear circuitos
La fila muestra el indicador cuando `sourceDeficit !== null && sourceDeficit !== deficit`. Funciona
para cualquier circuito futuro con la misma inconsistencia, no solo ZF — cumple la regla de «nada
de negocio hardcodeado».

### 3. Participación = share del déficit total, no de la plantilla autorizada
`participación = deficit / Σ(deficit de circuitos con deficit>0) × 100`. Circuitos con `deficit ≤ 0`
muestran «—» (no aplica, no tienen faltante). Coincide con el criterio del documento del usuario
(§4 «Participación de la necesidad»), que reparte el 100% solo entre los circuitos con faltante.

## Risks / Trade-offs

- **Reportes históricos sin columna DIF** → `sourceDeficit` queda `null`; sin advertencia visible,
  comportamiento correcto (no hay con qué comparar).
- **La advertencia no dice cuál valor confiar** → intencional; es una señal para Operaciones, no una
  resolución automática (evita que el sistema decida por sí solo un dato de negocio ambiguo).
