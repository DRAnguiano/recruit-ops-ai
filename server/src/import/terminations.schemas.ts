import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato esperado YYYY-MM-DD');

const TERMINATION_TYPES = [
  'renuncia_voluntaria',
  'abandono_trabajo',
  'rescision_contrato',
  'pension_incapacidad',
] as const;

/** Baja histórica ya parseada por el cliente desde las hojas «Bajas <Mes/Sem>». */
const terminationRowSchema = z.object({
  employeeNameRaw: z.string().min(1),
  employeeNameNormalized: z.string().min(1),
  empNoRaw: z.string().min(1).nullable().optional(),
  circuit: z.string().min(1).nullable().optional(),
  hireDate: dateString.nullable().optional(),
  terminationDate: dateString,
  terminationType: z.enum(TERMINATION_TYPES).nullable().optional(),
  terminationTypeRaw: z.string().min(1).nullable().optional(),
  terminationCategory: z.string().min(1).nullable().optional(),
  reasonShort: z.string().min(1).nullable().optional(),
  reasonDetail: z.string().min(1).nullable().optional(),
  comment: z.string().min(1).nullable().optional(),
  tenureDays: z.number().int().min(0).nullable().optional(),
  sourceSheet: z.string().min(1),
});

export const terminationsImportSchema = z.object({
  rows: z.array(terminationRowSchema).min(1).max(500),
});

export type TerminationsImport = z.infer<typeof terminationsImportSchema>;
export type TerminationRowImport = z.infer<typeof terminationRowSchema>;
