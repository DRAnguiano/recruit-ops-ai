# Tasks — hide-empty-capacity-sections

## 1. Guards por sección + empty-state

- [x] 1.1 `App.tsx` (tab capacity): envolver la sección de flota (KPIs por empresa + gráfica) en
      `fleet.length > 0 && ( … )`
- [x] 1.2 Envolver el avance contra metas en `goalsProgressData.length > 0 && ( … )`
- [x] 1.3 Empty-state de la pestaña cuando `fleet`, `goalsProgressData` y `circuitCapacity` están
      todos vacíos: tarjeta con mensaje explicativo de qué cargar

## 2. Verificación

- [x] 2.1 Lint (`tsc --noEmit`) + verificación manual en el navegador contra `crm_reclutamiento`
      (con operadores + circuit_capacity cargados, sin fleet ni goals): la pestaña Capacidad
      muestra solo la sección por circuito; las de flota y metas quedan ocultas; sin empty-state
      global (porque circuito sí tiene datos)