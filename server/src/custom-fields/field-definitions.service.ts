import { Inject, Injectable } from '@nestjs/common';
import { asc, Column, eq, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { DB, Database } from '../database/database.module';
import { DomainError, notFound } from '../common/domain-error';
import { DomainEventsService } from '../events/domain-events.service';
import {
  leadFieldDefinitions,
  leadFieldValues,
  personFieldDefinitions,
  personFieldValues,
} from '../database/schema';
import { FieldDefinitionCreate, FieldDefinitionUpdate } from './custom-fields.schemas';
import { FieldValuesService } from './field-values.service';

export type FieldEntity = 'lead' | 'person';

interface DefinitionTable extends PgTable {
  id: Column;
  key: Column;
  sortOrder: Column;
}
interface ValueTable extends PgTable {
  definitionId: Column;
}

const DEFINITIONS_TABLE: Record<FieldEntity, DefinitionTable> = {
  lead: leadFieldDefinitions as unknown as DefinitionTable,
  person: personFieldDefinitions as unknown as DefinitionTable,
};
const VALUES_TABLE: Record<FieldEntity, ValueTable> = {
  lead: leadFieldValues as unknown as ValueTable,
  person: personFieldValues as unknown as ValueTable,
};

/**
 * CRUD del diccionario de campos personalizados (custom-fields), una pareja
 * de tablas por entidad con el mismo shape (design decisión 2). `key` es
 * inmutable tras crear: se desactiva, no se renombra — mismo patrón que
 * los catálogos de valores de dominio.
 */
@Injectable()
export class FieldDefinitionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    private readonly values: FieldValuesService,
  ) {}

  async list(entity: FieldEntity): Promise<unknown[]> {
    const table = DEFINITIONS_TABLE[entity];
    return this.db.select().from(table as PgTable).orderBy(asc(table.sortOrder), asc(table.key));
  }

  async create(entity: FieldEntity, input: FieldDefinitionCreate): Promise<unknown> {
    const table = DEFINITIONS_TABLE[entity];
    let rows: unknown[];
    try {
      rows = await this.db
        .insert(table)
        .values({
          key: input.key,
          label: input.label,
          type: input.type,
          options: input.type === 'select' ? input.options : null,
          required: input.required ?? false,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new DomainError(
          'DUPLICATE_RESOURCE',
          `Ya existe una definición de campo ${entity} con key "${input.key}"`,
          409,
        );
      }
      throw error;
    }
    const row = rows[0] as { id: string };
    this.values.invalidate(entity);
    await this.audit(entity, 'definition_created', row.id, { data: input });
    return row;
  }

  async update(entity: FieldEntity, id: string, patch: FieldDefinitionUpdate): Promise<unknown> {
    const table = DEFINITIONS_TABLE[entity];
    const rows = await this.db
      .update(table)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(table.id, id))
      .returning();
    const row = rows[0] as { id: string } | undefined;
    if (!row) throw this.missing(entity, id);

    this.values.invalidate(entity);
    await this.audit(entity, 'definition_updated', id, { changes: patch });
    return row;
  }

  async remove(entity: FieldEntity, id: string): Promise<void> {
    const valuesTable = VALUES_TABLE[entity];
    const [referencing] = await this.db
      .select({ one: sql<number>`1` })
      .from(valuesTable as PgTable)
      .where(eq(valuesTable.definitionId, id))
      .limit(1);
    if (referencing) {
      throw new DomainError(
        'RESOURCE_REFERENCED',
        `No se puede borrar: hay valores guardados con esta definición`,
        409,
      );
    }

    const table = DEFINITIONS_TABLE[entity];
    const rows = await this.db.delete(table).where(eq(table.id, id)).returning();
    if (rows.length === 0) throw this.missing(entity, id);

    this.values.invalidate(entity);
    await this.audit(entity, 'definition_deleted', id, {});
  }

  private missing(entity: FieldEntity, id: string): DomainError {
    return notFound(
      `${entity.toUpperCase()}_FIELD_DEFINITION_NOT_FOUND`,
      `No existe definición de campo ${entity} con id ${id}`,
    );
  }

  private async audit(
    entity: FieldEntity,
    action: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.append({
      type: `${entity}_field.${action}`,
      aggregateType: `${entity}_field_definition`,
      aggregateId,
      actor: 'user',
      payload,
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code === '23505';
  }
}
