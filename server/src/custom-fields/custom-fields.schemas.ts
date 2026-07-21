import { z } from 'zod';

const FIELD_TYPES = ['text', 'number', 'boolean', 'select', 'date'] as const;

/** `select` exige `options` no vacío; los demás tipos lo ignoran (queda null). */
const selectNeedsOptions = (
  v: { type?: string; options?: string[] | null },
  ctx: z.RefinementCtx,
): void => {
  if (v.type === 'select' && (!v.options || v.options.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "'select' requiere una lista 'options' no vacía",
      path: ['options'],
    });
  }
};

/** Alta de definición de campo (lead o persona, mismo shape). */
export const fieldDefinitionCreateSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().min(1)).optional(),
    required: z.boolean().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine(selectNeedsOptions);
export type FieldDefinitionCreate = z.infer<typeof fieldDefinitionCreateSchema>;

/** Edición: `key` es inmutable tras crear (strict() rechaza el intento con 400). */
export const fieldDefinitionUpdateSchema = z
  .object({
    label: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().min(1)).nullable(),
    required: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial()
  .strict()
  .superRefine(selectNeedsOptions);
export type FieldDefinitionUpdate = z.infer<typeof fieldDefinitionUpdateSchema>;

/**
 * Escritura de valor por el endpoint público: sólo `value`. Cualquier
 * `source`/evidencia que venga en el body se descarta (no es `.strict()` a
 * propósito) — el controller siempre llama al servicio con `source: 'human'`
 * fijo en el código (design decisión 5).
 */
export const fieldValueSetSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type FieldValueSet = z.infer<typeof fieldValueSetSchema>;
