## Context

`automaticAttributionList()` (`src/App.tsx:591-627`) ya calcula, en el navegador, el match
candidato↔operador por `op.normalizedPhones.includes(lead.phone)`. `operators.normalized_phones`
se construye al importar el directorio fusionando `companyCell`/`personalCell`/`partnerCell`
normalizados (`parseOperatorsDirectory`, `fileParsers.ts:138+`) — el celular de pareja/familiar ya
está incluido ahí, no hace falta una columna separada. Verificado contra `crm_reclutamiento`: 6
matches únicos por teléfono (últimos 10 dígitos) entre los 309 leads de WhatsApp y los 582
operadores. `LeadsService.linkOperator` (ya existe) fija `matched_operator_id` y —desde el change
anterior— abre/enriquece el `employment_episode`. El flujo manual (`handleManualMatchSubmit`)
además marca `status='hired'` en un segundo paso; el automático debe hacer lo mismo para ser
equivalente.

## Goals / Non-Goals

**Goals:** persistir los matches unívocos por teléfono; abrir su episodio; marcarlos `hired`;
reportar ambigüedades sin aplicarlas.

**Non-Goals:** distinguir el campo de origen (empresa/personal/pareja) en el backend; matching por
nombre; tocar la lógica de creación de leads/operadores; ejecutar el cruce automáticamente en cada
ingesta (es una acción explícita del usuario, como hoy el enlace manual).

## Decisions

### 1. Comparación por últimos 10 dígitos, reutilizando el teléfono del `channel_identity`
El candidato de WhatsApp se identifica por `channel_identities.external_id` (E.164 con prefijo país,
ej. `5218716660000`); el operador por `operators.normalized_phones` (10 dígitos). Se comparan por
los últimos 10 dígitos de ambos — mismo criterio que ya usa el frontend vía `lead.phone` (que ya
llega normalizado a 10 dígitos desde `toUiPhone`).

### 2. Solo se aplican matches unívocos; los ambiguos se reportan
Un teléfono puede, en teoría, repetirse entre operadores (error de captura) o un operador tener
varios candidatos con el mismo teléfono normalizado (poco probable pero posible). El endpoint solo
vincula cuando hay **exactamente un** candidato sin vincular para **exactamente un** operador sin
vincular; si hay más de una posibilidad, no decide — lo reporta en `ambiguous[]` para revisión
humana (regla §2: el sistema no adivina).

### 3. Reutilizar `linkOperator` + marcar `hired`, no una vía paralela
El endpoint nuevo llama a `LeadsService.linkOperator` (mismo camino que el panel manual, que ya
abre el episodio) y, si el link se aplicó, hace `update(id, { status: 'hired' })` — replicando
exactamente el comportamiento de `handleManualMatchSubmit`. Cero lógica de negocio duplicada.

### 4. Ya vinculados se saltan, no se re-procesan
Operadores con episodio ya atribuido o leads con `matchedOperatorId` ya seteado se excluyen del
barrido — el endpoint es reejecutable sin duplicar trabajo ni pisar vínculos existentes.

## Risks / Trade-offs

- **Un teléfono compartido por error** (ej. empresa presta el mismo celular a dos operadores)
  produciría una ambigüedad reportada, no una atribución incorrecta silenciosa — correcto por diseño.
- **Marcar `hired` automáticamente** podría sorprender si el usuario esperaba solo «vincular» sin
  cerrar el lead → es el mismo comportamiento que ya tiene el botón manual «Vincular candidato»,
  así que es consistente, no nuevo.
