## Context

`EmploymentEpisodesService.ensureForOperator` ya implementa el criterio «fijar una vez, rellenar
nulos, nunca sobrescribir» para `personId`/`leadId`/`hiredByAgentId`/`campaignId`/`hireDate`. La
oferta vigente de una campaña se deriva en `CampaignOffersService` (mayor `version` con
`status='published'`) — no existe como columna, se calcula en la consulta.

## Goals / Non-Goals

**Goals:** congelar la oferta vigente al abrir/enriquecer el episodio, mismo criterio que el resto
de la atribución; exponerla en lectura y en la UI.

**Non-Goals:** recalcular o actualizar `offerVersionId` después de fijado; correlacionar con bajas;
permitir asignar manualmente una oferta a un episodio ya existente.

## Decisions

### 1. Resolver la oferta vigente dentro de `ensureForOperator`, no en el caller
`EmploymentEpisodesService` importa la lógica de «oferta vigente» directamente (mismo query que
`CampaignOffersService.listForCampaign` usa para `isCurrent`, sin depender de ese servicio para no
crear un ciclo de módulos) — al crear el episodio o al rellenar un `campaignId` antes nulo, si hay
`campaignId` (nuevo o ya existente) y el episodio no tiene `offerVersionId`, se busca la oferta
publicada de mayor versión de esa campaña y se fija. Igual regla de «solo una vez»: si
`offerVersionId` ya está fijado, nunca se toca.

### 2. Se resuelve en el momento del hito de contratación, no con un trigger a futuro
Si la campaña no tiene oferta publicada cuando se contrata, `offerVersionId` queda `null` para
siempre — no hay un job que la rellene después si Marketing publica una oferta más tarde. Esto es
intencional: la oferta debe reflejar lo que el candidato *vio*, y si no había ninguna publicada al
momento de contratar, no hay nada que congelar (inventar una sería falsear qué vio realmente).

### 3. Lectura: join simple, sin duplicar el criterio de "vigente"
`list()` hace `leftJoin` directo a `campaign_offers` por `offerVersionId` (ya es la fila congelada,
no hay que recalcular nada) y expone `offerVersion`/`offerSalaryText`/`offerValidFrom`/
`offerValidTo` — no se reexpone el contenido completo (24 campos) en la tabla de contrataciones,
solo el resumen necesario para verlo de un vistazo; el detalle completo se consulta en el panel de
campañas.

## Risks / Trade-offs

- **La mayoría de los episodios existentes no tendrán oferta** (backfill previo a este change, y
  las campañas reales aún no tienen ofertas publicadas) → correcto y honesto, se muestra "Sin
  oferta capturada", no se inventa.
- **Si dos campañas distintas publican ofertas al mismo tiempo que se resuelve el episodio**, no
  hay condición de carrera real porque la resolución ocurre síncronamente dentro de la misma
  llamada a `ensureForOperator`, sobre el estado de `campaign_offers` en ese instante.
