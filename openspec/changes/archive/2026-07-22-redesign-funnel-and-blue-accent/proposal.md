## Why

La pestaña «Funnel de la Semana» se llama funnel pero no muestra un embudo: son seis KPI cards
sueltas + tabla + gráfica de barras. No se ve la caída etapa-a-etapa (cuántos leads llegan, cuántos
se convierten en conversación, cuántos contesta la reclutadora, cuántos se contratan), que es
justo lo que el operador necesita leer de un vistazo para saber dónde se cae el reclutamiento.

Además, el acento visual de toda la plataforma es naranja (`#FF671F`/`orange-*`, ~83 usos en 9
archivos, casi todos clases hardcodeadas y no el token del tema). El usuario pide migrar el diseño a
**blanco con azul brillante** (`#2563EB`/`blue-600`), dejando el naranja/ámbar solo para alertas de
atención urgente. El semáforo verde/amarillo/rojo de estados se conserva (no es acento de marca).

## What Changes

- **Embudo visual semanal**: nuevo componente que grafica las etapas del reclutamiento del periodo
  con su caída porcentual entre pasos. Las etapas se derivan **solo de señales que ya existen** en
  el modelo, sin inventar etapas fantasma:
  1. Leads ingresados (periodo) · 2. Conversaciones reales (`isConversationReal`) ·
  3. Contestados por reclutadora (`responded`) · 4. Contratados (`status = hired`).
  Se documenta que las etapas intermedias de perfilamiento (perfilado/apto) se sumarán cuando exista
  el dato (change de scoring/perfilamiento), no antes.
- **KPI cards de resumen**: se conservan arriba del embudo como tira de indicadores, restyle al
  nuevo color.
- **Acento azul en la plataforma**: barrido `orange-*`/`amber-*` → `blue-*` en las vistas
  (App.tsx, CoverageView, ImportModule, AdminView, Sidebar, CampaignsView, KPICard,
  CustomFieldsPanel) y en `index.css`. `#2563EB`=`blue-600` (acento), `#1D4ED8`=`blue-700` (hover).
- **Naranja reservado a alertas**: el token `tm-orange` se conserva y se usa solo en indicadores de
  atención urgente (p. ej. déficit alto de flota/circuito, SLA vencido). El semáforo de estados
  (verde/amarillo/rojo) no se toca.

Fuera de alcance: calcular `firstResponse*` (backlog ya anotado; por eso «Contestados» hoy es 0),
corregir `isConversationReal` hardcodeado a `true` en el mapper, y rediseñar otras pestañas más allá
del cambio de color.

## Capabilities

### New Capabilities

- `spa-weekly-funnel`: la pestaña Funnel muestra un embudo por etapas del reclutamiento del periodo,
  con conteo y caída entre etapas, derivado solo de señales existentes.
- `spa-blue-accent-theme`: la plataforma usa azul brillante como color de acento sobre blanco, con
  naranja/ámbar reservado a alertas de atención urgente y el semáforo de estados intacto.

## Impact

- **Frontend**: `src/index.css` (tokens/acento), `src/App.tsx` (pestaña funnel + color), nuevo
  componente de embudo, y barrido de color en `src/components/*`.
- **Backend**: sin cambios. **Sin migración. Sin dependencias nuevas.**
- **Datos**: el embudo refleja el estado real actual (se desploma en «Contestados» porque
  `responded` aún no se computa) — es fiel, no un bug de esta vista.
