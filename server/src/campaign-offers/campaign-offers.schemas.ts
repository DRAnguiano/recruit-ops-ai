import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato esperado YYYY-MM-DD');

/** Contenido de la oferta (campaign-offers): lo que se promete al candidato. Todo opcional. */
const offerContentSchema = z.object({
  salaryText: z.string().min(1).nullable().optional(),
  paymentForm: z.string().min(1).nullable().optional(),
  bonuses: z.string().min(1).nullable().optional(),
  benefits: z.string().min(1).nullable().optional(),
  perDiem: z.string().min(1).nullable().optional(),
  restDays: z.string().min(1).nullable().optional(),
  schedule: z.string().min(1).nullable().optional(),
  routeType: z.string().min(1).nullable().optional(),
  circuit: z.string().min(1).nullable().optional(),
  unitType: z.string().min(1).nullable().optional(),
  vacancyType: z.string().min(1).nullable().optional(),
  newUnits: z.boolean().nullable().optional(),
  unitCondition: z.string().min(1).nullable().optional(),
  maintenanceCulture: z.string().min(1).nullable().optional(),
  operatorCare: z.string().min(1).nullable().optional(),
  safety: z.string().min(1).nullable().optional(),
  stability: z.string().min(1).nullable().optional(),
  familyMessage: z.string().min(1).nullable().optional(),
  substanceFreePolicy: z.boolean().nullable().optional(),
  requirements: z.string().min(1).nullable().optional(),
  location: z.string().min(1).nullable().optional(),
  adText: z.string().min(1).nullable().optional(),
  creativeRef: z.string().min(1).nullable().optional(),
  cta: z.string().min(1).nullable().optional(),
  validFrom: dateString.nullable().optional(),
  validTo: dateString.nullable().optional(),
});

export const campaignOfferCreateSchema = offerContentSchema;
export const campaignOfferUpdateSchema = offerContentSchema;

export type CampaignOfferCreate = z.infer<typeof campaignOfferCreateSchema>;
export type CampaignOfferUpdate = z.infer<typeof campaignOfferUpdateSchema>;
