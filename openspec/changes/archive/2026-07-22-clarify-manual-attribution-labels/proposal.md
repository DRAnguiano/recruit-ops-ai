## Why

El panel de asociación manual (pestaña Atribución y Contratos) mezcla términos para la misma
entidad: «Candidatos», «Lead de WhatsApp» y «Prospecto» refieren todos al candidato, y el botón dice
«Realizar Atribución» cuando la acción real es *vincular* un candidato con un operador ya contratado
(la atribución de campaña es una consecuencia, no la acción). Es confuso e inconsistente con el
vocabulario estandarizado (Candidatos / Operadores contratados). Solo es copy de UI.

## What Changes

Renombres en el panel de asociación manual (`src/App.tsx`), sin cambiar lógica:

- Título: «Asociación Manual de Candidatos» → «Vincular candidato con operador contratado».
- Descripción: aclarar que vincula un candidato de WhatsApp con un operador ya contratado cuando sus
  teléfonos no coinciden.
- Label 1: «Seleccione Lead de WhatsApp:» → «Candidato de WhatsApp:»; placeholder «-- Seleccionar
  Prospecto --» → «-- Seleccionar candidato --».
- Label 2: «Vincular con Operador Contratado:» → «Operador contratado:»; placeholder «-- Seleccionar
  Operador --» → «-- Seleccionar operador --».
- Botón: «Realizar Atribución» → «Vincular candidato».
- Mensajes de estado: usar «candidato» en vez de «lead»/«atribución» jerga.

Fuera de alcance: lógica de vinculación, endpoints, atribución automática (ya funciona).

## Capabilities

### New Capabilities

- `spa-manual-attribution`: el panel de asociación manual usa vocabulario claro y consistente
  (candidato ↔ operador contratado) para vincular un candidato con un operador cuando sus teléfonos
  no coinciden.

## Impact

- **Frontend**: `src/App.tsx` (labels + mensajes del panel manual). **Sin backend, sin migración.**
