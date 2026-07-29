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

export const whatsappHistoryImportSchema = z.object({
  /** Nombre de la reclutadora dueña de estas conversaciones (se siembra si no existe). */
  agent: z.string().min(1),
  messages: z.array(historicalMessageSchema).min(1).max(2000),
});

export type WhatsappHistoryImport = z.infer<typeof whatsappHistoryImportSchema>;
