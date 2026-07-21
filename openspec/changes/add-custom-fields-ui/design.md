## Context

Toda la API necesaria ya existe (`add-custom-fields`, 11): CRUD de
`/api/lead-field-definitions` y `/api/person-field-definitions` (`key` inmutable, `select`
exige `options`, DELETE referenciado → 409), y `GET/PUT /api/leads/:id/custom-fields[/:key]`
+ equivalente `/api/people/:id/...` (validado por tipo, `PUT` público siempre
`source='human'`). La SPA (React 19 + Vite + Tailwind) ya tiene el patrón de
`AdminView.tsx` con `CatalogTable` (componente genérico para catálogos de dominio) y un
modal de chat en `App.tsx` con un panel de metadatos del prospecto (`activeChatLead`,
`ChatLead.id` = lead uuid, `ChatLead.personId` = persona uuid) — el lugar natural para el
formulario dinámico de valores.

## Goals / Non-Goals

**Goals:**
- Definir/editar/desactivar campos personalizados de lead y de persona desde
  Administración, mismo patrón visual que los catálogos existentes.
- Capturar sus valores desde el modal de chat, con un input apropiado por tipo.
- Errores tipados (400 con `allowed`, 409 referenciado) mostrados de forma clara.

**Non-Goals:**
- Cambios de backend (la API ya cubre todo).
- Escritura `source='ai'` desde la SPA — no existe ese endpoint (roadmap propio de
  roles/LLM, ver `add-custom-fields`).
- Reordenar por drag-and-drop, campos calculados, o dependencias entre campos.
- Roles/permisos de acceso al editor del diccionario (no hay auth de usuarios en la SPA).

## Decisions

### 1. Dos tablas de diccionario en Administración, no una genérica por `entity`
`LeadFieldDefinitionsTable` y `PersonFieldDefinitionsTable` (o un componente parametrizado
por `endpoint` similar a `CatalogTable`, instanciado dos veces) — refleja la decisión de
backend de dos parejas de tablas por entidad (11, decisión 2). A diferencia de
`CatalogTable` (que sólo maneja `name`/`label`/`active`/`sortOrder`), esta tabla necesita
un selector de `type` y un editor de `options` (lista de strings) que aparece solo cuando
`type='select'`.
- *Alternativa descartada*: una sola tabla con selector de entidad (lead/persona) → el
  backend ya expone endpoints separados; mezclar complicaría el componente sin necesidad.

### 2. Formulario de valores dentro del modal de chat existente, no una vista aparte
El panel de metadatos del prospecto ya vive en el modal de chat (`App.tsx`, sección
"Panel de Metadatos del Prospecto"). Los campos personalizados de **lead** se agregan ahí
mismo, cargando `GET /api/leads/:id/custom-fields` al abrir el chat (junto con
`openChatViewer`); los de **persona** en la misma sección con
`GET /api/people/:personId/custom-fields`, distinguidos por un subtítulo. Un input por
`type`: `text`→input texto, `number`→input numérico, `boolean`→checkbox, `select`→select
con `options`, `date`→input date. Guardar en blur/change dispara
`PUT .../custom-fields/:key` y refresca solo ese campo (no recarga el chat completo).
- *Alternativa descartada*: vista dedicada de "ficha del candidato" → mayor alcance de UI
  no pedido; el modal de chat ya es donde la reclutadora mira los datos del prospecto.

### 3. Distinción visual `source` sin lógica nueva de negocio
Un valor con `source='ai'` muestra un badge pequeño ("IA") junto al campo; `human` no
muestra nada (es el caso normal, ya que hoy todo lo que la SPA escribe es `human`). Esto es
puramente informativo — la SPA no decide precedencia, el backend ya la aplica.

### 4. Manejo de errores igual que `CatalogTable`
Mismo patrón: `try/catch` alrededor de cada mutación, `ApiError.code` determina el mensaje
(`RESOURCE_REFERENCED` → sugerir desactivar; `VALIDATION_ERROR` con `allowed` en `select`
→ listar los valores permitidos junto al campo). Sin estado optimista: cada guardado
recarga desde la respuesta del backend.

## Risks / Trade-offs

- [Cargar custom-fields en cada apertura de chat añade una llamada más] → Aceptado; el
  patrón ya hace varias llamadas al abrir (conversaciones + mensajes); una más no cambia
  la experiencia perceptible.
- [Un campo `required=true` sin valor no bloquea nada hoy (no hay validación de
  "obligatorio" en el pipeline de leads)] → Fuera de alcance: `required` es informativo en
  esta UI (resalta el campo vacío), no impide guardar; forzarlo pertenece a un futuro
  motor de completitud/score.
- [Sin auth] cualquier usuario de la SPA puede editar el diccionario y los valores; igual
  que el resto de la app hoy.

## Migration Plan

Solo frontend; sin migraciones ni cambios de env. Deploy normal de la SPA.

## Open Questions

- Ninguna bloqueante.
