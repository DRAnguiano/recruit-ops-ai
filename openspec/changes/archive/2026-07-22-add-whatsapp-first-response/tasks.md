# Tasks — add-whatsapp-first-response

## 1. Contrato del payload

- [x] 1.1 `whatsapp-history.schemas.ts`: agregar `leadMetrics?: { externalUserId, responded,
      firstResponseMinutesNatural: number|null, firstResponseMinutesWork: number|null }[]` al
      `whatsappHistoryImportSchema` (opcional, no rompe imports previos).

## 2. Frontend: propagar las métricas del ChatLead

- [x] 2.1 `src/api/whatsapp-history.ts`: helper `chatLeadToMetric(cl)` que deriva `externalUserId`
      igual que `chatLeadToInbound` y devuelve la métrica del `ChatLead`.
- [x] 2.2 `src/components/ImportModule.tsx`: por lote, construir `leadMetrics = batch.map(chatLeadToMetric)`
      e incluirlo en el body del `POST /api/import/whatsapp-history`.

## 3. Backend: persistir + auditar

- [x] 3.1 `whatsapp-history.controller.ts`: tras la ingestión, por cada `leadMetric` localizar el
      lead (`channel_identity(externalUserId)` → `person` → `lead`) y `UPDATE` con `responded` y
      `firstResponseMinutes*`. Leads sin métrica quedan intactos.
- [x] 3.2 Emitir `domain_event` `lead.first_response_imported` con `{ source: 'whatsapp-history',
      responded, minutesWork }`.
- [x] 3.3 Devolver en el resultado cuántos leads recibieron métricas (`leadsMetricsApplied`).

## 4. Verificación

- [x] 4.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [x] 4.2 Re-ejecutar el import contra los 3 zips (`Chats Damaris/Gladys/Hernan`) — vía la UI o un
      script que reuse el parser — y confirmar `leadsMetricsApplied > 0`, idempotente en 2ª corrida.
- [x] 4.3 Verificar en BD/dashboard: tasa de respuesta global ≈ 64% y medianas hábiles por
      reclutadora en el orden esperado (R1≈26, R2≈47, R3≈26.5 min); el embudo ya no cae a 0 en
      «Contestados».
