## Why

El usuario necesita control total de cada contratación —quién contrató, cuándo, bajo qué campaña—
fijado de forma inmutable «como en el contrato», y que ese registro sea la base para, más adelante,
medir permanencia y bajas por campaña/promesa. Hoy esos datos viven dispersos y mutables: el
reclutador y la campaña están en el `lead` (cambian con reasignaciones), la fecha en el `operator`,
y no existe un registro que los **congele al momento de contratar** ni el concepto de **episodio
laboral** (una persona con múltiples episodios: contratación → baja → reingreso).

Este change crea ese cimiento: la tabla `employment_episodes`, que abre un episodio por cada
contratación con un **snapshot inmutable** de la atribución. La baja (motivo/fecha/tipo) y la
permanencia 30/60/90 se agregan al mismo episodio en el change siguiente; la oferta versionada,
después.

## What Changes

- **Nueva tabla `employment_episodes`**: un episodio por operador (contratación), con snapshot de
  `operatorId`, `hireDate`, y —si un lead casó con ese operador— `personId`, `leadId`,
  `hiredByAgentId` (reclutador que contrató) y `campaignId` (campaña atribuida). `episodeType`
  = `new` | `rehire`. Los campos del snapshot se fijan una vez (inmutables); no hay vía de edición.
- **Alta del episodio al contratar**: cuando se vincula un candidato a un operador
  (`linkOperator`), se abre/enriquece el episodio con la atribución congelada. Emite
  `employment_episode.created` para auditoría.
- **Backfill**: un episodio por cada operador existente (los 637), tomando la atribución del lead
  que casó por `matched_operator_id` cuando exista; `new` por defecto, `rehire` si la misma persona
  ya tiene un episodio previo.
- **Lectura**: `GET /api/employment-episodes` y una tabla «Registro de contrataciones (inmutable)»
  en la pestaña Atribución, mostrando operador · fecha · reclutador que contrató · campaña · tipo.

Fuera de alcance: baja/motivo/permanencia (change 2), oferta versionada (change 3), detección fina
de reingreso entre distintos `empNo` (requiere las bajas históricas del change 2).

## Capabilities

### New Capabilities

- `employment-episodes`: registro inmutable de cada contratación como episodio laboral, con snapshot
  de reclutador, fecha y campaña, base del ciclo de vida laboral (contratación → baja → reingreso).

## Impact

- **Backend**: `schema.ts` (tabla), migración `0013`, `EmploymentEpisodesService`, controller
  (GET + hook en `linkOperator`), evento de dominio.
- **Frontend**: `src/App.tsx` (tabla en Atribución) + `src/api` (tipo + fetch).
- **Datos**: se puebla el backfill contra `crm_reclutamiento` (637 operadores). **Migración aditiva**
  (tabla nueva), sin tocar tablas existentes. **Sin dependencias nuevas.**
