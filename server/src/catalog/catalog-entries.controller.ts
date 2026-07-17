import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { uuidParam } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CatalogEntriesService } from './catalog-entries.service';
import { catalogEntryCreateSchema, catalogEntryUpdateSchema } from './catalog.schemas';

type EntryCreate = z.infer<typeof catalogEntryCreateSchema>;
type EntryUpdate = z.infer<typeof catalogEntryUpdateSchema>;

const createPipe = new ZodValidationPipe(catalogEntryCreateSchema);
const updatePipe = new ZodValidationPipe(catalogEntryUpdateSchema);

/**
 * CRUD de los catálogos de valores de dominio (configurable-catalogs). Los
 * cuatro recursos comparten forma y reglas (name inmutable, DELETE
 * referenciado → 409, mutaciones auditadas); rutas explícitas por recurso.
 */
@Controller()
export class CatalogEntriesController {
  constructor(private readonly entries: CatalogEntriesService) {}

  // ── Empresas ──────────────────────────────────────────────────────────
  @Get('companies')
  listCompanies() {
    return this.entries.list('company');
  }
  @Post('companies')
  createCompany(@Body(createPipe) body: EntryCreate) {
    return this.entries.create('company', body);
  }
  @Patch('companies/:id')
  updateCompany(@Param('id', uuidParam()) id: string, @Body(updatePipe) body: EntryUpdate) {
    return this.entries.update('company', id, body);
  }
  @Delete('companies/:id')
  deleteCompany(@Param('id', uuidParam()) id: string) {
    return this.entries.remove('company', id);
  }

  // ── Circuitos ─────────────────────────────────────────────────────────
  @Get('circuits')
  listCircuits() {
    return this.entries.list('circuit');
  }
  @Post('circuits')
  createCircuit(@Body(createPipe) body: EntryCreate) {
    return this.entries.create('circuit', body);
  }
  @Patch('circuits/:id')
  updateCircuit(@Param('id', uuidParam()) id: string, @Body(updatePipe) body: EntryUpdate) {
    return this.entries.update('circuit', id, body);
  }
  @Delete('circuits/:id')
  deleteCircuit(@Param('id', uuidParam()) id: string) {
    return this.entries.remove('circuit', id);
  }

  // ── Tipos de vacante ──────────────────────────────────────────────────
  @Get('vacancy-types')
  listVacancyTypes() {
    return this.entries.list('vacancy_type');
  }
  @Post('vacancy-types')
  createVacancyType(@Body(createPipe) body: EntryCreate) {
    return this.entries.create('vacancy_type', body);
  }
  @Patch('vacancy-types/:id')
  updateVacancyType(@Param('id', uuidParam()) id: string, @Body(updatePipe) body: EntryUpdate) {
    return this.entries.update('vacancy_type', id, body);
  }
  @Delete('vacancy-types/:id')
  deleteVacancyType(@Param('id', uuidParam()) id: string) {
    return this.entries.remove('vacancy_type', id);
  }

  // ── Estados de lead ───────────────────────────────────────────────────
  @Get('lead-statuses')
  listLeadStatuses() {
    return this.entries.list('lead_status');
  }
  @Post('lead-statuses')
  createLeadStatus(@Body(createPipe) body: EntryCreate) {
    return this.entries.create('lead_status', body);
  }
  @Patch('lead-statuses/:id')
  updateLeadStatus(@Param('id', uuidParam()) id: string, @Body(updatePipe) body: EntryUpdate) {
    return this.entries.update('lead_status', id, body);
  }
  @Delete('lead-statuses/:id')
  deleteLeadStatus(@Param('id', uuidParam()) id: string) {
    return this.entries.remove('lead_status', id);
  }
}
