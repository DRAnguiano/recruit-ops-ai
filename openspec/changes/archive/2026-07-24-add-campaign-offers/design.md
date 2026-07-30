## Context

`campaigns` no tiene ningún campo de «promesa» — solo metadatos de marketing (gasto, leads,
vigencia de la campaña). El proyecto ya tiene el concepto «borrador → publicación inmutable;
evaluaciones referencian versión» documentado (project.md §6) pero sin implementación previa; este
es el primer caso real. Precedente cercano en el código: `employment_episodes` ya modela
«congelar al momento X, nunca sobrescribir» (snapshot de reclutador/campaña al contratar) — mismo
espíritu, aplicado aquí a contenido en vez de referencias.

## Goals / Non-Goals

**Goals:** capturar el contenido completo de la oferta (checklist del análisis del usuario);
versionado inmutable al publicar; una oferta vigente derivable sin bandera mutable.

**Non-Goals:** snapshot en `employment_episodes` (change siguiente); comparar ofertas entre sí o con
resultados de permanencia (análisis futuro, una vez haya datos capturados); vacantes múltiples por
campaña (una campaña → una línea de ofertas versionadas, igual que hoy una campaña → una vacante
opcional vía `campaigns.vacancyId`).

## Decisions

### 1. Un draft a la vez por campaña; publicar es lo que crea la versión inmutable
Al crear una oferta para una campaña sin borrador pendiente, nace en `status='draft'`,
`version = MAX(version) + 1` para esa campaña (o 1 si es la primera). Mientras es `draft`, se puede
editar libremente (`PATCH`). `POST .../publish` la vuelve `status='published'` y fija
`publishedAt` — desde ahí es inmutable (el `PATCH` rechaza si `status='published'`, 409). Para
cambiar la oferta después de publicar, se crea un **nuevo** draft (nueva versión); la publicada
anterior queda intacta para siempre.

### 2. «Vigente» derivado, no almacenado
La oferta vigente de una campaña es la de mayor `version` con `status='published'` — se calcula en
la consulta (`ORDER BY version DESC LIMIT 1 WHERE status='published'`), no se guarda un flag
`isCurrent` que alguien tendría que mantener sincronizado. Evita el bug clásico de «dos filas
marcadas vigentes a la vez».

### 3. Contenido: columnas tipadas, no campos genéricos
A diferencia de `custom-fields` (pensado para lead/persona con evidencia+fuente por captura
conversacional), la oferta es contenido de Marketing capturado directamente — columnas tipadas en
`campaign_offers` (mismo criterio que `campaigns`/`operators`/`circuit_capacity`: muchas columnas
de dominio, valores siempre dato, nunca hardcodeados en código). La mayoría `text` (el checklist
mezcla texto libre y categorías informales — forzar `select` en todo sería inventar una taxonomía
no pedida); `newUnits`/`substanceFreePolicy` son los únicos claramente binarios.

### 4. Sin FK a `job_vacancies`; `circuit`/`vacancyType` como texto propio de la oferta
La oferta puede prometer algo ligeramente distinto a como está capturada la vacante interna (p. ej.
el anuncio dice «Clarios» y la vacante interna usa otro nombre de circuito) — se declara qué
prometió el anuncio, no se fuerza a coincidir con el catálogo interno. Mismo criterio ya usado en
`circuit_capacity.circuit` (texto del reporte, sin FK).

## Risks / Trade-offs

- **~20 columnas nullable en una tabla** → tabla ancha, pero cada columna es dato de negocio real
  del checklist del usuario, no invención; alternativa (JSON de contenido) perdería tipado y
  auditabilidad columna-por-columna sin ganar nada aquí (el esquema no cambia entre ofertas).
- **Un solo draft por campaña a la vez** → simplifica el modelo; si se necesitan drafts paralelos
  (ej. dos personas editando la próxima versión) se resuelve fuera de alcance de este change.
