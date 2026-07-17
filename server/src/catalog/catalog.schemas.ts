import { z } from 'zod';

/** Fecha calendario "YYYY-MM-DD" (las columnas `date` de PG son strings). */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato esperado YYYY-MM-DD');

/** Hora local "HH:MM" en la TZ del schedule. */
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato esperado HH:MM');

/** Monto de dinero → string para columnas numeric de PG. */
const money = z.coerce.number().min(0).transform((n) => n.toFixed(2));

/** TZ IANA válida: si Intl no la conoce, se rechaza (regla 7: nunca TZ del servidor). */
const ianaTimezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'zona horaria IANA inválida' },
);

/** Entradas de catálogo de valores de dominio (configurable-catalogs). */
export const catalogEntryCreateSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
// `name` es inmutable tras crear: strict() rechaza la clave con 400 en vez
// de ignorarla en silencio (se desactiva la entrada y se crea otra).
export const catalogEntryUpdateSchema = z
  .object({
    label: z.string().min(1),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial()
  .strict();

export const campaignCreateSchema = z.object({
  externalId: z.string().min(1).nullable().optional(),
  name: z.string().min(1),
  source: z.enum(['meta_api', 'csv', 'manual']).optional(),
  startDate: dateString.nullable().optional(),
  endDate: dateString.nullable().optional(),
  isoWeek: z.string().min(1).nullable().optional(),
  spend: money.optional(),
  /** ISO-4217; default USD (decisión §3.14). */
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  leadsReported: z.number().int().min(0).optional(),
  clicks: z.number().int().min(0).nullable().optional(),
  targetAgentId: z.string().uuid().nullable().optional(),
  modality: z.enum(['local', 'foreign']).nullable().optional(),
  vacancyId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'paused']).optional(),
  /** Cola de acciones manuales de pausa (project.md §3.4). */
  pauseRequestedAt: z.coerce.date().nullable().optional(),
});
export const campaignUpdateSchema = campaignCreateSchema.partial();

export const vacancyCreateSchema = z.object({
  // El tipo no es enum cerrado: los tipos de vacante serán catálogo
  // configurable (add-configurable-catalogs).
  type: z.string().min(1),
  circuit: z.string().min(1).nullable().optional(),
  modality: z.enum(['local', 'foreign']),
  company: z.string().min(1),
  quota: z.number().int().min(0).optional(),
  status: z.enum(['open', 'paused', 'closed']).optional(),
});
export const vacancyUpdateSchema = vacancyCreateSchema.partial();

export const agentCreateSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
});
export const agentUpdateSchema = agentCreateSchema.partial();

export const operatorCreateSchema = z.object({
  empNo: z.string().min(1),
  company: z.string().min(1),
  name: z.string().min(1),
  hireDate: dateString.nullable().optional(),
  status: z.enum(['active', 'leaving']).optional(),
  normalizedPhones: z.array(z.string().regex(/^\d{10}$/)).optional(),
  /** Qué se contrató (catálogo vacancy_types) y para qué circuito. */
  operatorType: z.string().min(1).nullable().optional(),
  circuit: z.string().min(1).nullable().optional(),
});
export const operatorUpdateSchema = operatorCreateSchema.partial();

export const fleetCreateSchema = z.object({
  company: z.string().min(1),
  totalTractors: z.number().int().min(0).optional(),
  tractorsInService: z.number().int().min(0).optional(),
  tractorsWithoutOperator: z.number().int().min(0).optional(),
  activeServices: z.number().int().min(0).optional(),
});
export const fleetUpdateSchema = fleetCreateSchema.partial();

export const goalCreateSchema = z.object({
  /** weekly | monthly (estructural, no catálogo): default monthly. */
  periodKind: z.enum(['weekly', 'monthly']).optional(),
  company: z.string().min(1),
  vacancyType: z.string().min(1),
  circuit: z.string().min(1).nullable().optional(),
  target: z.number().int().min(0),
});
export const goalUpdateSchema = goalCreateSchema.partial();

export const workScheduleCreateSchema = z.object({
  name: z.string().min(1),
  workDays: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: timeString,
  endTime: timeString,
  timezone: ianaTimezone.optional(),
});
export const workScheduleUpdateSchema = workScheduleCreateSchema.partial();

export const classificationRuleCreateSchema = z.object({
  category: z.enum(['ad_cta', 'internal_hr', 'vacancy_type']),
  target: z.string().min(1).nullable().optional(),
  keywords: z.array(z.string().min(1)).min(1),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});
export const classificationRuleUpdateSchema = classificationRuleCreateSchema.partial();

export const messageTemplateCreateSchema = z.object({
  name: z.string().min(1),
  language: z.string().min(2).optional(),
  channel: z.enum(['whatsapp', 'telegram']).optional(),
  body: z.string().min(1),
  variablesCount: z.number().int().min(0).max(20).optional(),
  status: z.enum(['approved', 'pending', 'rejected']).optional(),
  active: z.boolean().optional(),
});
export const messageTemplateUpdateSchema = messageTemplateCreateSchema.partial();

export const operatorsBulkSchema = z.object({
  items: z.array(operatorCreateSchema).min(1).max(5000),
});

export const campaignsBulkSchema = z.object({
  items: z
    .array(
      campaignCreateSchema
        .omit({ source: true })
        .refine((c) => c.externalId || c.isoWeek, {
          message: 'cada campaña necesita externalId o isoWeek (llave name+isoWeek)',
        }),
    )
    .min(1)
    .max(5000),
});
