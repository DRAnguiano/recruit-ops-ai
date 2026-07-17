import { Inject, Injectable } from '@nestjs/common';
import { asc, Column, eq, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { DB, Database } from '../database/database.module';
import { DomainError, notFound } from '../common/domain-error';
import {
  circuits,
  companies,
  goals,
  jobVacancies,
  leads,
  leadStatuses,
  operators,
  fleet,
  vacancyTypes,
} from '../database/schema';
import { CatalogCrudService } from './catalog-crud.service';
import { CatalogKind, CatalogValueService } from './catalog-value.service';

interface CatalogEntryTable extends PgTable {
  id: Column;
  name: Column;
  sortOrder: Column;
}

const TABLE_BY_KIND: Record<CatalogKind, CatalogEntryTable> = {
  company: companies as unknown as CatalogEntryTable,
  circuit: circuits as unknown as CatalogEntryTable,
  vacancy_type: vacancyTypes as unknown as CatalogEntryTable,
  lead_status: leadStatuses as unknown as CatalogEntryTable,
};

/**
 * Las filas de negocio referencian el catálogo por `name` en columnas de
 * texto (no FK): el chequeo de "referenciado" es una consulta explícita por
 * cada columna consumidora. Borrar algo en uso → 409, nunca cascada.
 */
const REFERENCES_BY_KIND: Record<CatalogKind, Column[]> = {
  company: [jobVacancies.company, operators.company, fleet.company, goals.company],
  circuit: [jobVacancies.circuit, operators.circuit, goals.circuit],
  vacancy_type: [
    jobVacancies.type,
    operators.operatorType,
    goals.vacancyType,
    leads.detectedVacancyType,
  ],
  lead_status: [leads.status],
};

export interface CatalogEntryInput {
  name: string;
  label: string;
  active?: boolean;
  sortOrder?: number;
}

/** CRUD de los catálogos de valores de dominio (configurable-catalogs). */
@Injectable()
export class CatalogEntriesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crud: CatalogCrudService,
    private readonly values: CatalogValueService,
  ) {}

  async list(kind: CatalogKind): Promise<unknown[]> {
    const table = TABLE_BY_KIND[kind];
    return this.db
      .select()
      .from(table as PgTable)
      .orderBy(asc(table.sortOrder), asc(table.name));
  }

  async create(kind: CatalogKind, input: CatalogEntryInput): Promise<unknown> {
    const row = await this.crud.create(
      TABLE_BY_KIND[kind] as PgTable,
      kind,
      input as never,
    );
    this.values.invalidate(kind);
    return row;
  }

  async update(kind: CatalogKind, id: string, patch: Partial<CatalogEntryInput>): Promise<unknown> {
    const table = TABLE_BY_KIND[kind];
    const row = await this.crud.update(table as PgTable, table.id, kind, id, patch as never);
    this.values.invalidate(kind);
    return row;
  }

  async remove(kind: CatalogKind, id: string): Promise<void> {
    const table = TABLE_BY_KIND[kind];
    const [entry] = (await this.db
      .select()
      .from(table as PgTable)
      .where(eq(table.id, id))) as Array<{ name: string }>;
    if (!entry) {
      throw notFound(`${kind.toUpperCase()}_NOT_FOUND`, `No existe ${kind} con id ${id}`);
    }

    for (const column of REFERENCES_BY_KIND[kind]) {
      const [ref] = await this.db
        .select({ one: sql<number>`1` })
        .from(column.table)
        .where(eq(column, entry.name))
        .limit(1);
      if (ref) {
        throw new DomainError(
          'RESOURCE_REFERENCED',
          `No se puede borrar: hay filas que usan ${kind} "${entry.name}"`,
          409,
        );
      }
    }

    await this.crud.remove(table as PgTable, table.id, kind, id);
    this.values.invalidate(kind);
  }
}
