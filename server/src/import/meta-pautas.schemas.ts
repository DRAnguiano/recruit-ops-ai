import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato esperado YYYY-MM-DD');

/** Una campaña de pauta ya parseada por el cliente (meta-pautas-import). */
const pautaSchema = z.object({
  /** Reclutadora dueña (nombre ya resuelto por el cliente, alias aplicado). */
  agent: z.string().min(1),
  name: z.string().min(1),
  startDate: dateString.nullable().optional(),
  endDate: dateString.nullable().optional(),
  spend: z.number().min(0).optional(),
  leadsReported: z.number().int().min(0).optional(),
});

export const metaPautasImportSchema = z.object({
  campaigns: z.array(pautaSchema).min(1).max(1000),
});

export type MetaPautasImport = z.infer<typeof metaPautasImportSchema>;
