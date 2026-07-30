# Tasks — redesign-funnel-and-blue-accent

## 1. Embudo visual semanal (spa-weekly-funnel)

- [x] 1.1 Nuevo `src/components/WeeklyFunnel.tsx`: componente presentacional que recibe
      `stages: { label, value, hint? }[]` y `total`, y dibuja barras horizontales proporcionales con
      conteo, % del total y caída vs. etapa anterior. Estado vacío si `total === 0`. Acento azul.
- [x] 1.2 En `src/App.tsx` (tab funnel): construir las 4 etapas desde métricas existentes
      (`filteredLeadsForPeriod`, `isConversationReal`, `responded`, `status='hired'`) y renderizar
      `WeeklyFunnel` debajo de las KPI cards. Comentario: etapas de perfilamiento se sumarán con dato.
- [x] 1.3 Mantener las KPI cards de resumen arriba del embudo (restyle al color nuevo).

## 2. Acento azul en la plataforma (spa-blue-accent-theme)

- [x] 2.1 `src/index.css`: fondo blanco/#F8FAFC; conservar `--color-tm-orange` como semántico de
      alerta; documentar el mapeo de acento a `blue-600`/`blue-700`.
- [x] 2.2 `src/App.tsx`: barrido `orange-*`/`amber-*` → `blue-*` (acento), preservando semáforo y
      alertas urgentes reales.
- [x] 2.3 Barrido de color en componentes: `CoverageView.tsx`, `ImportModule.tsx`, `AdminView.tsx`,
      `Sidebar.tsx`, `CampaignsView.tsx`, `KPICard.tsx`, `CustomFieldsPanel.tsx` — azul de acento,
      naranja/ámbar solo donde marca atención urgente (déficit alto, SLA).
- [x] 2.4 Revisar que el semáforo verde/amarillo/rojo quede intacto y que no quede naranja de acento
      residual (`grep orange-/amber-/tm-orange` solo en contextos de alerta).

## 3. Verificación

- [x] 3.1 `npm run lint` (tsc SPA) en verde
- [x] 3.2 Verificación en el navegador contra `crm_reclutamiento`: la pestaña Funnel muestra el
      embudo (Leads/Conversaciones altos, Contestados/Contratados en 0, fiel al dato), KPIs arriba,
      y el acento azul consistente en todas las vistas; sin naranja de acento fuera de alertas.
