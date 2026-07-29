## Why

Al implementar el registro inmutable de contratación (`employment-episodes`), el backfill contra
`crm_reclutamiento` mostró **0 episodios con atribución** pese a que el usuario sabía de operadores
cuyo teléfono coincide con un candidato de WhatsApp (incluyendo el celular de la pareja/familiar).
Investigando: el cruce por teléfono **ya existe y funciona**, pero solo en el frontend
(`automaticAttributionList` en `App.tsx`) — calcula el match y lo pinta en la tabla «Lista de
Atribuciones Confirmadas», pero nunca lo persiste en `leads.matched_operator_id`. Verificado contra
la BD real: **6 matches por teléfono** existen hoy (`operators.normalized_phones`, que ya fusiona
celular empresa/personal/pareja al importar el directorio), coincidiendo con las «6 contrataciones
atribuidas con confianza alta» del análisis operativo del usuario.

Este change persiste esos matches: al guardarlos, abren automáticamente su `employment_episode`
(vía el hook ya construido en `linkOperator`) y quedan reflejados en el embudo («Operadores
contratados») y en el registro de contrataciones.

## What Changes

- **Nuevo endpoint `POST /api/leads/auto-attribute-by-phone`**: recorre los operadores, busca un
  candidato de WhatsApp cuyo teléfono coincida con algún `normalizedPhones` del operador
  (últimos 10 dígitos), y cuando el match es **unívoco** (un operador ↔ un candidato, ninguno ya
  vinculado) llama a `linkOperator` + marca el lead `status='hired'` — el mismo par de pasos que
  hace hoy la vinculación manual. Matches ambiguos (mismo teléfono en más de un operador o
  candidato) se reportan pero NO se aplican, para no adivinar.
- **Botón «Cruzar por teléfono» en el panel de atribución**: dispara el endpoint y muestra el
  resultado (vinculados / ya vinculados / ambiguos).
- La tabla «Lista de Atribuciones Confirmadas» (frontend) sigue funcionando igual; ahora sus
  resultados también quedan persistidos y auditables.

Fuera de alcance: distinguir «Celular Empresa/Personal/Pareja» en el backend (esa distinción vive
solo en la fuente del import y hoy no se persiste por separado — se documenta como gap, no se
resuelve aquí); matching por nombre; deduplicación de operadores.

## Capabilities

### Modified Capabilities

- `employment-episodes`: los episodios se abren también desde el match automático por teléfono, no
  solo desde la vinculación manual.

### New Capabilities

- `automatic-phone-attribution`: el sistema persiste el cruce candidato↔operador por teléfono
  (incluye celular de pareja/familiar, ya fusionado en `normalizedPhones`) cuando es unívoco, y lo
  reporta cuando es ambiguo — nunca adivina.

## Impact

- **Backend**: `LeadsService`/`LeadsController` (nuevo endpoint), reutiliza `linkOperator` y
  `EmploymentEpisodesService` ya existentes. **Sin migración, sin tabla nueva.**
- **Frontend**: botón + manejo de resultado en el panel de Atribución.
- **Datos**: se ejecuta contra `crm_reclutamiento`; se espera enlazar los ~6 matches unívocos
  identificados.
