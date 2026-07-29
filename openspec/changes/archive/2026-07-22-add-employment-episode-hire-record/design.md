## Context

Esquema actual: `operators` (id, empNo único, company, name, hireDate, status active|leaving,
operatorType, circuit) = cada operador es una contratación vigente. `leads` (personId, campaignId,
assignedAgentId, matchedOperatorId, status) — un lead casado con un operador aporta la atribución
(reclutador + campaña). No hay entidad de episodio ni snapshot inmutable. La atribución en el lead
es mutable (reasignaciones). El flujo de contratación es `linkOperator` (`POST /leads/:id/operator`)
que fija `matched_operator_id`, más el PATCH a `status='hired'`.

## Goals / Non-Goals

**Goals:** un registro inmutable por contratación con reclutador/fecha/campaña congelados; base del
episodio laboral; poblar los 637 operadores; exponerlo para lectura.

**Non-Goals:** baja/motivo/permanencia (change 2); oferta versionada (change 3); reingreso fino entre
empNos distintos; cambiar la lógica de `hired` o de atribución automática.

## Decisions

### 1. `employment_episodes`, un episodio por operador (unique)
```
employment_episodes:
  id            uuid pk
  operator_id   uuid NOT NULL UNIQUE → operators.id   -- 1 episodio por contratación (hoy)
  person_id     uuid → people.id        (nullable)     -- desde el lead casado, si hay
  lead_id       uuid → leads.id         (nullable)     -- el candidato que convirtió
  hired_by_agent_id uuid → agents.id    (nullable)     -- reclutador que contrató (snapshot)
  campaign_id   uuid → campaigns.id     (nullable)     -- campaña atribuida (snapshot)
  hire_date     date                    (nullable)     -- snapshot de operators.hire_date
  episode_type  text NOT NULL DEFAULT 'new'            -- 'new' | 'rehire'
  snapshot_at   timestamptz NOT NULL DEFAULT now()
  created_at, updated_at
```
`operator_id UNIQUE` hace el backfill y el alta idempotentes (`onConflictDoNothing`). Los campos de
atribución son **inmutables**: se escriben al abrir el episodio y no hay endpoint de edición. El
change 2 agregará columnas de terminación (end_date, termination_type, termination_reason) para
cerrar el episodio; permanencia = end_date − hire_date.

### 2. Inmutabilidad por ausencia de vía de escritura, no por trigger
No se expone update de los campos de snapshot. `ensureForOperator` inserta si no existe; si el
episodio existe pero le falta la atribución (se creó por backfill sin lead casado y luego se vincula
un candidato), se permite **rellenar una sola vez** los campos nulos (nunca sobrescribir un valor ya
fijado). Simple y suficiente; un trigger de inmutabilidad estricta es sobre-ingeniería para esta fase.

### 3. Alta en `linkOperator`
Al vincular candidato→operador, `LeadsService.linkOperator` llama a `ensureForOperator` con la
atribución del lead (personId, leadId, assignedAgentId, campaignId, operator.hireDate). Así toda
contratación nueva nace con su episodio. Emite `employment_episode.created`.

### 4. `episodeType`: heurística simple ahora
`new` por defecto; `rehire` si `person_id` ya tiene un episodio previo. La detección fina entre
`empNo` distintos (misma persona, otro número de empleado) depende de las bajas históricas y de la
estrategia de identidad — se hará con el change 2. Se registra el campo desde ya para no re-migrar.

### 5. Backfill idempotente
Recorre `operators`; por cada uno, busca el lead con `matched_operator_id = operator.id` (si hay)
para la atribución; inserta el episodio (`onConflictDoNothing` por operator_id). Reejecutable.

## Risks / Trade-offs

- **Un episodio por operador** asume que un `empNo` = una contratación vigente. El reingreso con el
  mismo empNo reactivado no se modela aún → se aborda en change 2 con las bajas. Aceptable como base.
- **Atribución nula para hires sin lead casado** (los ~13 «sin atribución confiable») → correcto y
  honesto: no se inventa reclutador/campaña; queda null y visible como «sin atribución».
- **Rellenar nulos una vez** podría, en teoría, competir con dos vínculos al mismo operador → en la
  práctica un operador se vincula a un candidato; el `UNIQUE` y el «solo rellenar nulos» lo acotan.
