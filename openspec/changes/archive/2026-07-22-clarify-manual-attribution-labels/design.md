## Context

Panel «Asociación Manual de Candidatos» en `src/App.tsx` (~1210-1266): dos selects (candidato sin
vincular → operador contratado sin vincular) + botón que llama `handleManualMatchSubmit`, el cual
vincula el operador al lead (`POST /leads/:id/operator`) y marca `status='hired'`. Los textos mezclan
lead/prospecto/candidato y usan «atribución» para la acción de vincular.

## Goals / Non-Goals

**Goals:** copy claro y consistente (candidato ↔ operador contratado); la acción se llama «vincular».
**Non-Goals:** cambiar la lógica, los endpoints, el comportamiento de `hired`, o la atribución
automática.

## Decisions

### 1. Un solo término por entidad
«Candidato» para el lead de WhatsApp; «Operador contratado» para el registro del directorio. Se
elimina «Prospecto» y «Lead» del copy visible.

### 2. La acción es «Vincular», no «Atribución»
El botón y los mensajes hablan de vincular candidato con operador. La atribución de campaña es
resultado de esa vinculación, no la acción que el usuario ejecuta aquí; nombrarla «Atribución»
confunde.

## Risks / Trade-offs

- Solo texto; sin riesgo funcional. Los `value` de los selects (teléfono / empNo) no cambian.
