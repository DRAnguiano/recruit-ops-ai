## Why

La vista de Capacidad muestra tres secciones preexistentes que dependen de datos que no siempre
están cargados: el déficit por empresa/flota (necesita `fleet`), la gráfica de flota (idem) y el
avance contra metas mensuales (necesita `goals` monthly). Cuando esos datos faltan, la vista
enseña un «Déficit Total: 0 Conductores», tablas sin filas y barras vacías — que se leen como un
bug, no como «sin datos». Es justo la inconsistencia §25.5 del diagnóstico («KPI en cero que no
diferencian cero real de sin datos»). La nueva sección de capacidad por circuito ya se oculta
cuando no tiene datos; este change aplica el mismo criterio a las secciones de flota y metas.

## What Changes

- **Ocultar la sección de flota** (KPIs de déficit por empresa + gráfica de disponibilidad) cuando
  no hay filas de `fleet`.
- **Ocultar el avance contra metas** cuando no hay metas mensuales cargadas.
- **Empty-state de la pestaña**: si NINGUNA de las secciones de Capacidad tiene datos, mostrar un
  mensaje breve que explique qué archivo cargar, en vez de una pantalla en blanco — diferenciando
  «cero real» de «sin datos».

Fuera de alcance: cambios de backend, la sección por circuito (ya tiene su guard), y aplicar el
mismo criterio a otras vistas (se hará si el negocio lo pide).

## Capabilities

### New Capabilities

- `spa-capacity-empty-states`: la vista de Capacidad oculta las secciones sin datos y muestra un
  empty-state explicativo cuando no hay ninguna, distinguiendo «cero real» de «sin datos».

### Modified Capabilities

<!-- Ninguna: solo se agregan condiciones de render a una vista existente. -->>

## Impact

- **Frontend**: `src/App.tsx`, bloque `activeTab === 'capacity'` — condiciones de render por
  sección (`fleet.length`, metas) + empty-state.
- **Backend**: sin cambios. **Sin migración. Sin dependencias nuevas.**
