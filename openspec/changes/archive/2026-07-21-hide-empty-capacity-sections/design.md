## Context

La vista de Capacidad (`activeTab === 'capacity'` en `src/App.tsx`) renderiza incondicionalmente:
(1) KPIs de déficit por empresa + gráfica de flota (de `fleet` + `operators`), (2) avance contra
metas mensuales (de `goalsProgressData`, derivado de `goals`), y (3) capacidad por circuito (que
ya se envuelve en `circuitCapacity.length > 0 && …`). Cuando `fleet` o `goals` están vacíos, (1) y
(2) muestran ceros/tablas vacías. Es un cambio puramente de presentación.

## Goals / Non-Goals

**Goals:** ocultar (1) y (2) cuando no tienen datos; mostrar un empty-state en la pestaña solo si
las tres secciones están vacías. **Non-Goals:** backend, lógica de negocio, otras vistas.

## Decisions

### 1. Guard por sección con la longitud del dato que la alimenta
- Flota: `fleet.length > 0 && ( … )`.
- Metas: `goalsProgressData.length > 0 && ( … )`.
- Circuito: ya tiene su guard.
Mismo patrón que la sección por circuito; consistente y mínimo.

### 2. Empty-state solo cuando TODO está vacío
Si `fleet.length === 0 && goalsProgressData.length === 0 && circuitCapacity.length === 0`, se
muestra una tarjeta con un mensaje: «Sin datos de capacidad todavía — carga el reporte HC 2026, el
directorio de operadores o define metas en Administración». Diferencia «sin datos» de «cero real».
- *Alternativa descartada*: empty-state por sección → más ruido; basta uno de pestaña.

## Risks / Trade-offs

- [Si en el futuro `fleet` se carga parcialmente (una empresa) la sección aparece con esa sola] →
  correcto; muestra lo que hay.

## Migration Plan

Solo frontend; sin migración. Deploy normal de la SPA.

## Open Questions

- Ninguna.
