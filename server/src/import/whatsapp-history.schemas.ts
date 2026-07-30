import { z } from 'zod';

/**
 * Mensaje histórico entrante ya parseado por el cliente (whatsapp-history-import).
 * Mismo shape que `NormalizedInboundMessage` pero solo texto: los exports de
 * WhatsApp no traen binarios utilizables, solo `<Multimedia omitido>`.
 */
const historicalMessageSchema = z.object({
  externalMessageId: z.string().min(1),
  externalUserId: z.string().min(1),
  senderName: z.string().min(1).optional(),
  phoneE164: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  sentAt: z.coerce.date(),
  referral: z
    .object({
      sourceId: z.string().min(1),
      sourceType: z.string().optional(),
    })
    .optional(),
});

/**
 * Métricas de primera respuesta por persona, ya calculadas por el parser del cliente desde los
 * timestamps del reclutador en el export. `externalUserId` es el mismo identificador (teléfono en
 * dígitos) que usa la ingestión para localizar a la persona/lead.
 */
const leadMetricSchema = z.object({
  externalUserId: z.string().min(1),
  responded: z.boolean(),
  firstResponseMinutesNatural: z.number().nullable(),
  firstResponseMinutesWork: z.number().nullable(),
});

export const whatsappHistoryImportSchema = z.object({
  /** Nombre de la reclutadora dueña de estas conversaciones (se siembra si no existe). */
  agent: z.string().min(1),
  messages: z.array(historicalMessageSchema).min(1).max(2000),
  /** Opcional: métricas de primera respuesta a persistir por lead (fuente: el export). */
  leadMetrics: z.array(leadMetricSchema).max(2000).optional(),
});

export type WhatsappHistoryImport = z.infer<typeof whatsappHistoryImportSchema>;
