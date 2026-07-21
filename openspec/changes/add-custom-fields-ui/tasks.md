# Tasks — add-custom-fields-ui

## 1. Tipos y cliente API

- [x] 1.1 `types.ts`: `FieldDefinition` (`id`, `key`, `label`, `type`, `options`,
      `required`, `active`, `sortOrder`) y `FieldValue` (`key`, `label`, `type`,
      `options`, `required`, `value`, `source`, `evidenceText`, `evidenceMessageId`)
- [x] 1.2 `api/mappers.ts` o módulo nuevo `api/custom-fields.ts`: helpers de fetch para
      `/api/lead-field-definitions`, `/api/person-field-definitions`,
      `/api/leads/:id/custom-fields`, `/api/people/:id/custom-fields` (usando `api()` /
      `fetchAllPages` del cliente existente)

## 2. Editores del diccionario en Administración

- [x] 2.1 `AdminView.tsx`: componente de tabla de definiciones (basado en `CatalogTable`
      pero con selector de `type` y editor de `options` condicional a `select`) para
      `lead-field-definitions`
- [x] 2.2 Misma tabla instanciada para `person-field-definitions`; ambas en una nueva
      sección "Campos personalizados" de Administración
- [x] 2.3 Manejo de errores: `RESOURCE_REFERENCED` → sugerir desactivar; `VALIDATION_ERROR`
      (`select` sin options, `key` inmutable) → mensaje inline

## 3. Formulario dinámico en el visor de conversación

- [x] 3.1 `App.tsx`: cargar `GET /api/leads/:id/custom-fields` y
      `GET /api/people/:personId/custom-fields` al abrir el chat (`openChatViewer`)
- [x] 3.2 Sección "Campos personalizados" en el panel de metadatos del prospecto: un input
      por definición activa según `type` (text/number/boolean/select/date), prellenado con
      el valor actual
- [x] 3.3 Guardado por campo: `PUT .../custom-fields/:key` en blur/change; actualiza solo
      el estado de ese campo con la respuesta del backend (sin recargar el hilo)
- [x] 3.4 Badge visual para valores `source='ai'`; error 400 inline junto al campo
      (`allowed` en `select`)

## 4. Cierre

- [ ] 4.1 `project.md` §10 (marcar 11b) + verificación manual en navegador: crear
      definición de lead y de persona desde Administración, capturar valores desde el
      visor de chat, provocar y ver el error 400/409 en la UI
