## Why

`add-custom-fields` (11) dejó el diccionario de campos personalizados y sus valores con
evidencia disponibles **por API**, pero la SPA no tiene forma de definirlos ni de
capturarlos: hoy solo se puede operar con curl. Sin esto, la base del futuro score
auditable (project.md §2.4, §3.15) no es usable por la reclutadora en su trabajo diario.

## What Changes

- **Editores del diccionario en Administración**: dos tablas nuevas en `AdminView.tsx`
  (definiciones de lead y de persona) con el mismo patrón que `CatalogTable` — listar
  ordenado, crear (`key` + `label` + `type` + `options` si es `select` + `required`),
  editar `label`/`type`/`options`/`required`/`active`/`sortOrder` (`key` inmutable), borrar
  con manejo del 409 `RESOURCE_REFERENCED` (sugerir desactivar).
- **Formulario dinámico en el visor de conversación**: el panel de metadatos del prospecto
  (modal de chat, `App.tsx`) gana una sección "Campos personalizados" que carga
  `GET /api/leads/:id/custom-fields` (y `GET /api/people/:personId/custom-fields`),
  renderiza un input por tipo (`text`, `number`, `boolean`, `select`, `date`) con su valor
  actual, y guarda con `PUT .../custom-fields/:key` al perder foco o confirmar. Los valores
  con `source='ai'` se distinguen visualmente (badge) de los `human`; guardar desde la SPA
  siempre pasa por el endpoint público (el backend ya fuerza `source='human'`, sin cambios
  de contrato).
- **Manejo de errores tipados**: 400 `VALIDATION_ERROR` (incluye `allowed` en `select`) se
  muestra inline junto al campo; 404 de entidad no debería ocurrir en uso normal (se loguea
  y no rompe la vista).
- **Sin cambios de backend**: la API de `add-custom-fields` ya cubre todo lo necesario.

## Capabilities

### New Capabilities

- `spa-custom-fields`: administración del diccionario de campos personalizados (lead y
  persona) y captura de sus valores desde el visor de conversación, consumiendo la API de
  `custom-fields` con manejo de errores tipados (400/404/409).

### Modified Capabilities

<!-- Ninguna: no se cambia el contrato de spa-live-inbox ni spa-catalog-admin, solo se
     añade una sección nueva dentro de vistas existentes. -->

## Impact

- **SPA**: `src/components/AdminView.tsx` (dos tablas de diccionario nuevas, reusando/
  extendiendo el patrón de `CatalogTable`), `src/App.tsx` (sección de campos
  personalizados en el modal de chat, carga de valores al abrir), `src/api/mappers.ts`
  (tipos `FieldDefinition`/`FieldValue`), `src/types.ts`.
- **Backend**: sin cambios.
- **Sin migraciones.**
- **Fuera de alcance**: escritura `source='ai'` desde la SPA (no existe ese endpoint,
  sigue siendo roadmap propio de roles/LLM, documentado en 11); reordenar definiciones por
  drag-and-drop (edición de `sortOrder` como número, igual que catálogos).
