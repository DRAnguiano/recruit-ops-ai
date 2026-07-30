## Context

Cambio puramente de copy en la vista de resumen (pestaña `funnel`). Textos en
`Sidebar.tsx` (ítem de menú), `App.tsx` (títulos de KPI cards y etiquetas de etapas del embudo) y
`WeeklyFunnel.tsx` (título del embudo). Ningún valor ni cálculo cambia.

## Goals / Non-Goals

**Goals:** vocabulario de negocio (candidatos/operadores) consistente entre KPIs y etapas.
**Non-Goals:** lógica, métricas, orden/número de etapas, colores, `id` del tab (`funnel`) que es
identificador interno, no visible.

## Decisions

### 1. Solo cambia texto visible; el `id='funnel'` se conserva
El identificador del tab (`activeTab === 'funnel'`) no se toca — no es visible y cambiarlo rompería
el ruteo interno. Solo cambia el `name` mostrado.

### 2. «Candidatos atendidos» mantiene el valor porcentual
La KPI que era «Tasa de Respuesta» sigue mostrando el % de respondidos; solo cambia el título. El
subtítulo («Contestados por reclutadora») ya describe el dato, así que la lectura queda clara.

### 3. Etapas del embudo alineadas al mismo vocabulario
Para no mezclar términos, las 4 etapas pasan a: Candidatos recibidos · Conversaciones iniciadas ·
Candidatos atendidos · Operadores contratados (mismos valores y orden).

## Risks / Trade-offs

- Mínimos: solo texto. Un usuario acostumbrado a los términos viejos verá el nuevo vocabulario.
