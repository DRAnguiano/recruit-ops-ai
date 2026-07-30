# Tasks — add-profile-completeness-indicator

## 1. Indicador en CustomFieldsPanel

- [x] 1.1 Calcular `required`/`filled`/`pct`/`missingLabels` a partir de `rows` (memo o cálculo
      inline, sin nuevo estado ni fetch).
- [x] 1.2 Renderizar el indicador (conteo, %, barra de progreso) entre el título del panel y la
      lista de campos; oculto si `required.length === 0`.
- [x] 1.3 Renderizar la lista de campos requeridos faltantes (por `label`) cuando `pct < 100`.

## 2. Verificación

- [x] 2.1 `npm run lint` (tsc SPA) en verde.
- [x] 2.2 Verificación funcional contra `crm_reclutamiento`: abrir un candidato sin campos
      capturados (0/11), capturar algunos vía `PUT`, confirmar que el % y la lista de faltantes se
      actualizan correctamente sin recargar la página (misma lógica que ya prueba el guardado).
