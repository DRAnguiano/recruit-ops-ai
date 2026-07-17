# Tasks — add-catalog-admin-ui

## 1. Estados de lead desde el catálogo

- [x] 1.1 `App.tsx`: cargar `GET /api/lead-statuses` en el boot y bajarlo por props;
      `types.ts` con el tipo de entrada de catálogo
- [x] 1.2 `mappers.ts`: `leadStatusLabel`/`leadStatusToApi` desde el catálogo (fallback
      al `name` crudo); retirar el diccionario fijo de estados
- [x] 1.3 Bandeja CRM: select de estatus por fila y filtro de listado desde el catálogo
      (activos para escribir, todos para mostrar); badge del sidebar cuenta por
      `name === 'new'`

## 2. Vista de Administración

- [x] 2.1 `Sidebar.tsx`: tab "Administración"; esqueleto `AdminView.tsx` con secciones
      (catálogos, metas, settings)
- [x] 2.2 `CatalogTable` genérico (endpoint + título): listar ordenado, alta con
      name+label, edición de label/active/sortOrder, sin edición de name
- [x] 2.3 Borrado con manejo del 409 `RESOURCE_REFERENCED` (mensaje + sugerir
      desactivar); errores 400 con `issues` en línea
- [x] 2.4 Montar los 4 catálogos (empresas, circuitos, tipos de vacante, estados de
      lead) sobre `CatalogTable`

## 3. Metas y settings

- [x] 3.1 Editor de metas por periodo: formulario con selects de catálogo
      (circuit opcional), `periodKind`, `target`; 409 duplicado en línea; tabla
      agrupada por periodo con edición y borrado
- [x] 3.2 Settings: listar `GET /api/settings` con inputs numéricos y guardado por
      `PUT /api/settings/:key`
- [x] 3.3 Reubicar el editor de horario laboral a Administración (misma lógica
      `handleSaveSettings`) y retirarlo de Cobertura

## 4. Cierre

- [x] 4.1 `npm run build` de la SPA + lint sin errores
- [x] 4.2 Verificación manual: crear estado y circuito desde la UI → usarlos en la
      bandeja y en una meta semanal; borrar referenciado muestra el 409
- [x] 4.3 README + project.md §10 (marcar 10b) y commit de `openspec/` con el código
