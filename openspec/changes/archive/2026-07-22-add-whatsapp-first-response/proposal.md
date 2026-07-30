## Why

El dashboard muestra 0.0% de tasa de respuesta y 0 min de mediana porque los leads importados no
tienen `responded` ni `firstResponseMinutes*`: la importación de historial (whatsapp-history-import)
solo ingirió los mensajes del candidato y **descartó** los del reclutador. Pero el parser del cliente
(`parseWhatsAppChat`) **ya calcula** `responded`, `firstResponseMinutesNatural` y
`firstResponseMinutesWork` por conversación a partir de los timestamps reales del reclutador que
vienen en el export — solo que esos valores nunca se envían al backend. Los tres zips originales
(`Chats Damaris/Gladys/Hernan`) siguen en disco.

Este change propaga y persiste esas métricas (fuente: el propio export de WhatsApp, no inventadas),
de modo que el dashboard muestre la tasa de respuesta y las medianas **reales** por reclutadora
(que coinciden con el análisis operativo: R1 93% / 26 min, R2 33.8% / 47 min, R3 97.4% / 26.5 min).

El cálculo **en vivo** de la primera respuesta al llegar cada mensaje entrante (canales activos) es
un change posterior — aquí solo se puebla desde el historial ya analizado.

## What Changes

- **Payload del import** (`whatsapp-history.schemas.ts`): acepta un arreglo opcional `leadMetrics`
  con, por persona (`externalUserId`), `responded` + `firstResponseMinutesNatural/Work` ya
  calculados por el parser.
- **Frontend** (`ImportModule.tsx` + `whatsapp-history.ts`): al armar cada lote, adjunta esas
  métricas tomándolas del `ChatLead` (ya las tiene); no recalcula nada nuevo.
- **Controller** (`whatsapp-history.controller.ts`): tras la ingestión, actualiza cada lead
  (localizado por `externalUserId` → `channel_identity` → `person` → `lead`) con `responded` y
  `firstResponseMinutes*`. Emite un `domain_event` de auditoría con la fuente = import de historial.
- **Re-ejecución del import** contra los 3 zips → se pueblan las métricas → el dashboard muestra
  tasa de respuesta y medianas reales, y el embudo deja de desplomarse en «Contestados».

Fuera de alcance: cálculo en vivo de primera respuesta en canales entrantes; corregir
`isConversationReal` (hoy hardcodeado a `true` en el mapper); perfilamiento, atribución y SLA.

## Capabilities

### Modified Capabilities

- `whatsapp-history-import`: además de ingerir los mensajes del candidato, el import ahora persiste
  las métricas de primera respuesta del lead calculadas desde el export (respondido + tiempo natural
  y hábil).

## Impact

- **Frontend**: `src/components/ImportModule.tsx`, `src/api/whatsapp-history.ts`.
- **Backend**: `whatsapp-history.schemas.ts`, `whatsapp-history.controller.ts` (update + evento).
- **Datos**: se re-ejecuta el import (idempotente) para poblar los 311 leads. **Sin migración**
  (las columnas `responded`/`firstResponseMinutes*` ya existen). **Sin dependencias nuevas.**
