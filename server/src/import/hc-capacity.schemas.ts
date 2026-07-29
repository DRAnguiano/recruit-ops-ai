import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato esperado YYYY-MM-DD');

/** Capacidad de un circuito en el snapshot (operational-capacity). */
const circuitCapacitySchema = z.object({
  circuit: z.string().min(1),
  units: z.number().int().min(0).optional(),
  unitsInMaintenance: z.number().int().min(0).optional(),
  unitsActive: z.number().int().min(0).optional(),
  hcAuthorized: z.number().int().min(0).optional(),
  hcReal: z.number().int().min(0).optional(),
  deficit: z.number().int().optional(),
  /** DIF crudo del reporte, cuando el bloque lo trae; solo referencia. */
  sourceDeficit: z.number().int().nullable().optional(),
});

export const hcCapacityImportSchema = z.object({
  snapshotDate: dateString.nullable().optional(),
  circuits: z.array(circuitCapacitySchema).min(1).max(200),
});

export type HcCapacityImport = z.infer<typeof hcCapacityImportSchema>;
