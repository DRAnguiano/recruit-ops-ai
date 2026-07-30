## Context

`CustomFieldsPanel.tsx` ya carga, por `leadId`/`personId`, todos los campos activos de ambas
entidades vía `listFieldValues('leads'|'people', id)`, cada uno con `required: boolean` y
`value: unknown`. 11 de los 17 campos activos están marcados `required:true` (dato ya sembrado). El
panel hoy solo renderiza la lista editable; no hay ningún resumen agregado.

## Goals / Non-Goals

**Goals:** mostrar completitud (X/11) con desglose de lo que falta, calculado sobre `rows` que el
panel ya tiene en memoria.

**Non-Goals:** persistir el %, exponerlo en la Bandeja de Leads, ponderar campos (todos cuentan
igual), o construir cualquier lógica de scoring/decisión — es solo conteo de captura, determinista.

## Decisions

### 1. Cálculo derivado, no persistido
`required = rows.filter(r => r.field.required)`; `filled = required.filter(r => r.field.value !==
null)`. `pct = required.length ? filled.length / required.length * 100 : null` (si no hay campos
requeridos, no se muestra el indicador — no divide por cero ni miente con 100%/0%). Se recalcula en
cada render junto con `rows`, sin estado ni fetch adicional.

### 2. Desglose por label, nunca por key
La lista de faltantes usa `field.label` (texto de negocio) no `field.key` (identificador técnico) —
consistente con el resto de la UI, que nunca expone keys internas al usuario.

### 3. Ubicación: encabezado del panel, antes de la lista de campos
Se inserta entre el título «Campos personalizados» y la lista de filas — visible sin scroll junto
con el resto del panel, mismo componente, sin nueva sección de la app.

## Risks / Trade-offs

- **Cambiar cuáles campos son requeridos (dato) cambia el denominador** — es el comportamiento
  correcto: el indicador siempre refleja la definición vigente del perfil, no una copia congelada.
- **No pondera por importancia** (todos los 11 campos pesan igual) — aceptable para un indicador de
  completitud; ponderar sería ya un score, fuera de alcance (regla: la IA/UI no decide criterios).
