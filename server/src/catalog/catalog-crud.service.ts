import { Inject, Injectable } from '@nestjs/common';
import { Column, eq, InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { PgInsertValue, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { DB, Database } from '../database/database.module';
import { DomainError, notFound } from '../common/domain-error';
import { DomainEventsService } from '../events/domain-events.service';

/**
 * CRUD genérico de catálogos: tablas planas sin lógica de negocio propia
 * (design decisión 1). Cada mutación audita con actor='user'; los DELETE de
 * filas referenciadas fallan con error tipado (nunca cascada silenciosa).
 */
@Injectable()
export class CatalogCrudService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
  ) {}

  async list<T extends PgTable>(table: T): Promise<InferSelectModel<T>[]> {
    const rows = await this.db.select().from(table as PgTable);
    return rows as InferSelectModel<T>[];
  }

  async create<T extends PgTable>(
    table: T,
    aggregateType: string,
    values: InferInsertModel<T>,
  ): Promise<InferSelectModel<T>> {
    let rows: unknown[];
    try {
      rows = await this.db
        .insert(table)
        .values(values as PgInsertValue<T>)
        .returning();
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new DomainError(
          'DUPLICATE_RESOURCE',
          `Ya existe un ${aggregateType} con esos valores únicos`,
          409,
        );
      }
      throw error;
    }
    const row = rows[0] as InferSelectModel<T>;

    await this.events.append({
      type: `${aggregateType}.created`,
      aggregateType,
      aggregateId: this.idOf(row),
      actor: 'user',
      payload: { data: values as Record<string, unknown> },
    });
    return row;
  }

  async update<T extends PgTable>(
    table: T,
    idColumn: Column,
    aggregateType: string,
    id: string,
    patch: Partial<InferInsertModel<T>>,
  ): Promise<InferSelectModel<T>> {
    const rows = await this.db
      .update(table)
      .set({ ...patch, updatedAt: new Date() } as PgUpdateSetSource<T>)
      .where(eq(idColumn, id))
      .returning();
    const row = rows[0] as InferSelectModel<T> | undefined;
    if (!row) throw this.missing(aggregateType, id);

    await this.events.append({
      type: `${aggregateType}.updated`,
      aggregateType,
      aggregateId: id,
      actor: 'user',
      payload: { changes: patch as Record<string, unknown> },
    });
    return row;
  }

  async remove<T extends PgTable>(
    table: T,
    idColumn: Column,
    aggregateType: string,
    id: string,
  ): Promise<void> {
    let rows: unknown[];
    try {
      rows = await this.db.delete(table).where(eq(idColumn, id)).returning();
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new DomainError(
          'RESOURCE_REFERENCED',
          `No se puede borrar: otras filas referencian este ${aggregateType}`,
          409,
        );
      }
      throw error;
    }
    if (rows.length === 0) throw this.missing(aggregateType, id);

    await this.events.append({
      type: `${aggregateType}.deleted`,
      aggregateType,
      aggregateId: id,
      actor: 'user',
      payload: {},
    });
  }

  private idOf(row: unknown): string {
    return (row as { id: string }).id;
  }

  private missing(aggregateType: string, id: string): DomainError {
    return notFound(
      `${aggregateType.toUpperCase()}_NOT_FOUND`,
      `No existe ${aggregateType} con id ${id}`,
    );
  }

  private isForeignKeyViolation(error: unknown): boolean {
    // postgres.js expone el código PG en cause (drizzle 0.44 envuelve el error).
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code === '23503';
  }

  private isUniqueViolation(error: unknown): boolean {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code === '23505';
  }
}
