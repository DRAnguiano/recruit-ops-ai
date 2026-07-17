import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { uuidParam } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { paginationQuerySchema } from '../common/pagination';
import { CatalogValueService } from '../catalog/catalog-value.service';
import { LeadsService } from './leads.service';

const CLASSIFICATIONS = ['vacancy', 'internal_hr', 'other'] as const;

const listQuerySchema = paginationQuerySchema.extend({
  // El estado es catálogo (lead-statuses), no enum de código: el filtro
  // acepta cualquier string y devuelve vacío si nadie lo usa.
  status: z.string().min(1).optional(),
  classification: z.enum(CLASSIFICATIONS).optional(),
  detectedVacancyType: z.string().min(1).optional(),
  assignedAgentId: z.string().uuid().optional(),
  origin: z.string().min(1).optional(),
  campaignId: z.string().uuid().optional(),
  firstMessageFrom: z.coerce.date().optional(),
  firstMessageTo: z.coerce.date().optional(),
});

const patchBodySchema = z
  .object({
    status: z.string().min(1).optional(),
    notes: z.string().nullable().optional(),
    assignedAgentId: z.string().uuid().nullable().optional(),
    classification: z.enum(CLASSIFICATIONS).optional(),
    // La detección no es catálogo cerrado: los tipos de vacante serán
    // configurables (add-configurable-catalogs), así que solo se exige no-vacío.
    detectedVacancyType: z.string().min(1).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'El PATCH debe incluir al menos un campo',
  });

const operatorBodySchema = z.object({ operatorId: z.string().uuid().nullable() });

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly catalog: CatalogValueService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.leads.list(query);
  }

  @Get(':id')
  getById(@Param('id', uuidParam()) id: string) {
    return this.leads.getById(id);
  }

  @Patch(':id')
  async update(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(patchBodySchema)) body: z.infer<typeof patchBodySchema>,
  ) {
    if (body.status !== undefined) {
      await this.catalog.assertValid('lead_status', 'status', body.status);
    }
    return this.leads.update(id, body);
  }

  @Post(':id/operator')
  linkOperator(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(operatorBodySchema)) body: z.infer<typeof operatorBodySchema>,
  ) {
    return this.leads.linkOperator(id, body.operatorId);
  }
}
