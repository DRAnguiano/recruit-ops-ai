## Why

Punto 3 de la secuencia acordada tras contratación (1) y bajas/permanencia (2): «necesitamos medir
no solamente qué campaña contrató al operador, sino también qué se le prometió o comunicó en esa
campaña». Hoy `campaigns` no registra ninguna promesa (sueldo anunciado, prestaciones, horario,
estado de las unidades, etc.) — si Marketing cambia el anuncio, no hay forma de saber qué vio
realmente el candidato que fue contratado antes del cambio, ni de correlacionar después una baja
temprana con una promesa incumplida (ej. bono distinto al comunicado, unidades no tan nuevas como se
anunció). Regla §6 del proyecto: «Configuración versionada: borrador → publicación inmutable;
evaluaciones referencian versión» — la oferta es el primer caso real de este patrón.

## What Changes

- **Nueva tabla `campaign_offers`**: una oferta por campaña, versionada. Contenido: sueldo
  anunciado, forma de pago, bonos, prestaciones, viáticos, descansos, horario, tipo de ruta,
  circuito, tipo de unidad, tipo de vacante (Full/Sencillo), unidades nuevas, estado de las
  unidades, cultura de mantenimiento, atención al operador, seguridad, estabilidad, mensaje a la
  familia, política libre de sustancias, requisitos, ubicación, texto del anuncio, recurso
  creativo, CTA, vigencia (desde/hasta).
- **Ciclo borrador → publicación inmutable**: se crea y edita en `draft`; al publicar
  (`POST .../publish`) los campos quedan congelados — ninguna ruta permite editar una oferta
  publicada. Publicar una nueva versión no borra ni modifica la anterior; ambas persisten,
  distinguibles por `version` (correlativo por campaña).
- **«Vigente» = la de mayor versión publicada para esa campaña** — no hay una bandera mutable de
  «actual»; se deriva de `MAX(version) WHERE status='published'`, evitando un estado que alguien
  pueda desincronizar.
- **UI en Rendimiento de Campañas**: panel por campaña para crear/editar el borrador y publicarlo,
  con historial de versiones publicadas (solo lectura).

Fuera de alcance (change siguiente): congelar la oferta vigente en `employment_episodes` al
contratar (snapshot inmutable, igual criterio que `hiredByAgentId`/`campaignId`); correlacionar
oferta con bajas tempranas — eso requiere primero que existan ofertas capturadas.

## Capabilities

### New Capabilities

- `campaign-offers`: oferta versionada por campaña (borrador → publicación inmutable), con el
  contenido completo de lo que se promete al candidato.

## Impact

- **Backend**: `schema.ts` (tabla), migración `0016`, `campaign-offers.schemas.ts`,
  `campaign-offers.controller.ts` (CRUD de borrador + publish + lectura), evento de dominio.
- **Frontend**: `src/types.ts`, `src/api/campaign-offers.ts`, panel en `CampaignsView.tsx`.
- **Datos**: tabla nueva, sin datos previos que migrar. **Sin dependencias nuevas.**
