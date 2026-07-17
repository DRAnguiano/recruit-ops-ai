import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { uuidParam } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  agents,
  campaigns,
  classificationRules,
  fleet,
  goals,
  jobVacancies,
  messageTemplates,
  operators,
  workSchedules,
} from '../database/schema';
import { CatalogCrudService } from './catalog-crud.service';
import { CatalogKind, CatalogValueService } from './catalog-value.service';
import * as s from './catalog.schemas';

/**
 * CRUD plano de catálogos operativos. Endpoints mecánicos: valida con zod,
 * delega al CRUD genérico (auditoría y errores tipados incluidos).
 */
@Controller()
export class CatalogController {
  constructor(
    private readonly crud: CatalogCrudService,
    private readonly catalog: CatalogValueService,
  ) {}

  /** Valida contra catálogo los campos presentes (configurable-catalogs). */
  private async assertCatalogValues(
    fields: Partial<Record<'company' | 'circuit' | 'type' | 'vacancyType' | 'operatorType', string | null | undefined>>,
  ): Promise<void> {
    const checks: Array<[CatalogKind, string, string | null | undefined]> = [
      ['company', 'company', fields.company],
      ['circuit', 'circuit', fields.circuit],
      ['vacancy_type', 'type', fields.type],
      ['vacancy_type', 'vacancyType', fields.vacancyType],
      ['vacancy_type', 'operatorType', fields.operatorType],
    ];
    for (const [kind, field, value] of checks) {
      if (value != null) await this.catalog.assertValid(kind, field, value);
    }
  }

  // ── Campañas ──────────────────────────────────────────────────────────
  @Get('campaigns')
  listCampaigns() {
    return this.crud.list(campaigns);
  }
  @Post('campaigns')
  createCampaign(
    @Body(new ZodValidationPipe(s.campaignCreateSchema))
    body: z.infer<typeof s.campaignCreateSchema>,
  ) {
    return this.crud.create(campaigns, 'campaign', body);
  }
  @Patch('campaigns/:id')
  updateCampaign(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.campaignUpdateSchema))
    body: z.infer<typeof s.campaignUpdateSchema>,
  ) {
    return this.crud.update(campaigns, campaigns.id, 'campaign', id, body);
  }
  @Delete('campaigns/:id')
  deleteCampaign(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(campaigns, campaigns.id, 'campaign', id);
  }

  // ── Vacantes ──────────────────────────────────────────────────────────
  @Get('vacancies')
  listVacancies() {
    return this.crud.list(jobVacancies);
  }
  @Post('vacancies')
  async createVacancy(
    @Body(new ZodValidationPipe(s.vacancyCreateSchema))
    body: z.infer<typeof s.vacancyCreateSchema>,
  ) {
    await this.assertCatalogValues(body);
    return this.crud.create(jobVacancies, 'vacancy', body);
  }
  @Patch('vacancies/:id')
  async updateVacancy(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.vacancyUpdateSchema))
    body: z.infer<typeof s.vacancyUpdateSchema>,
  ) {
    await this.assertCatalogValues(body);
    return this.crud.update(jobVacancies, jobVacancies.id, 'vacancy', id, body);
  }
  @Delete('vacancies/:id')
  deleteVacancy(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(jobVacancies, jobVacancies.id, 'vacancy', id);
  }

  // ── Agentes ───────────────────────────────────────────────────────────
  @Get('agents')
  listAgents() {
    return this.crud.list(agents);
  }
  @Post('agents')
  createAgent(
    @Body(new ZodValidationPipe(s.agentCreateSchema)) body: z.infer<typeof s.agentCreateSchema>,
  ) {
    return this.crud.create(agents, 'agent', body);
  }
  @Patch('agents/:id')
  updateAgent(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.agentUpdateSchema)) body: z.infer<typeof s.agentUpdateSchema>,
  ) {
    return this.crud.update(agents, agents.id, 'agent', id, body);
  }
  @Delete('agents/:id')
  deleteAgent(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(agents, agents.id, 'agent', id);
  }

  // ── Operadores ────────────────────────────────────────────────────────
  @Get('operators')
  listOperators() {
    return this.crud.list(operators);
  }
  @Post('operators')
  async createOperator(
    @Body(new ZodValidationPipe(s.operatorCreateSchema))
    body: z.infer<typeof s.operatorCreateSchema>,
  ) {
    // La empresa del operador NO se valida: el bulk de CSV es fuente primaria.
    await this.assertCatalogValues({ operatorType: body.operatorType, circuit: body.circuit });
    return this.crud.create(operators, 'operator', body);
  }
  @Patch('operators/:id')
  async updateOperator(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.operatorUpdateSchema))
    body: z.infer<typeof s.operatorUpdateSchema>,
  ) {
    await this.assertCatalogValues({ operatorType: body.operatorType, circuit: body.circuit });
    return this.crud.update(operators, operators.id, 'operator', id, body);
  }
  @Delete('operators/:id')
  deleteOperator(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(operators, operators.id, 'operator', id);
  }

  // ── Flota ─────────────────────────────────────────────────────────────
  @Get('fleet')
  listFleet() {
    return this.crud.list(fleet);
  }
  @Post('fleet')
  createFleet(
    @Body(new ZodValidationPipe(s.fleetCreateSchema)) body: z.infer<typeof s.fleetCreateSchema>,
  ) {
    return this.crud.create(fleet, 'fleet', body);
  }
  @Patch('fleet/:id')
  updateFleet(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.fleetUpdateSchema)) body: z.infer<typeof s.fleetUpdateSchema>,
  ) {
    return this.crud.update(fleet, fleet.id, 'fleet', id, body);
  }
  @Delete('fleet/:id')
  deleteFleet(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(fleet, fleet.id, 'fleet', id);
  }

  // ── Metas (por periodo: weekly | monthly) ─────────────────────────────
  @Get('goals')
  listGoals() {
    return this.crud.list(goals);
  }
  @Post('goals')
  async createGoal(
    @Body(new ZodValidationPipe(s.goalCreateSchema)) body: z.infer<typeof s.goalCreateSchema>,
  ) {
    await this.assertCatalogValues(body);
    return this.crud.create(goals, 'goal', body);
  }
  @Patch('goals/:id')
  async updateGoal(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.goalUpdateSchema)) body: z.infer<typeof s.goalUpdateSchema>,
  ) {
    await this.assertCatalogValues(body);
    return this.crud.update(goals, goals.id, 'goal', id, body);
  }
  @Delete('goals/:id')
  deleteGoal(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(goals, goals.id, 'goal', id);
  }

  // ── Horarios de trabajo ───────────────────────────────────────────────
  @Get('work-schedules')
  listWorkSchedules() {
    return this.crud.list(workSchedules);
  }
  @Post('work-schedules')
  createWorkSchedule(
    @Body(new ZodValidationPipe(s.workScheduleCreateSchema))
    body: z.infer<typeof s.workScheduleCreateSchema>,
  ) {
    return this.crud.create(workSchedules, 'work_schedule', body);
  }
  @Patch('work-schedules/:id')
  updateWorkSchedule(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.workScheduleUpdateSchema))
    body: z.infer<typeof s.workScheduleUpdateSchema>,
  ) {
    return this.crud.update(workSchedules, workSchedules.id, 'work_schedule', id, body);
  }
  @Delete('work-schedules/:id')
  deleteWorkSchedule(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(workSchedules, workSchedules.id, 'work_schedule', id);
  }

  // ── Plantillas de mensaje ─────────────────────────────────────────────
  @Get('message-templates')
  listMessageTemplates() {
    return this.crud.list(messageTemplates);
  }
  @Post('message-templates')
  createMessageTemplate(
    @Body(new ZodValidationPipe(s.messageTemplateCreateSchema))
    body: z.infer<typeof s.messageTemplateCreateSchema>,
  ) {
    return this.crud.create(messageTemplates, 'message_template', body);
  }
  @Patch('message-templates/:id')
  updateMessageTemplate(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.messageTemplateUpdateSchema))
    body: z.infer<typeof s.messageTemplateUpdateSchema>,
  ) {
    return this.crud.update(messageTemplates, messageTemplates.id, 'message_template', id, body);
  }
  @Delete('message-templates/:id')
  deleteMessageTemplate(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(messageTemplates, messageTemplates.id, 'message_template', id);
  }

  // ── Reglas de clasificación ───────────────────────────────────────────
  @Get('classification-rules')
  listClassificationRules() {
    return this.crud.list(classificationRules);
  }
  @Post('classification-rules')
  createClassificationRule(
    @Body(new ZodValidationPipe(s.classificationRuleCreateSchema))
    body: z.infer<typeof s.classificationRuleCreateSchema>,
  ) {
    return this.crud.create(classificationRules, 'classification_rule', body);
  }
  @Patch('classification-rules/:id')
  updateClassificationRule(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(s.classificationRuleUpdateSchema))
    body: z.infer<typeof s.classificationRuleUpdateSchema>,
  ) {
    return this.crud.update(
      classificationRules,
      classificationRules.id,
      'classification_rule',
      id,
      body,
    );
  }
  @Delete('classification-rules/:id')
  deleteClassificationRule(@Param('id', uuidParam()) id: string) {
    return this.crud.remove(classificationRules, classificationRules.id, 'classification_rule', id);
  }
}
