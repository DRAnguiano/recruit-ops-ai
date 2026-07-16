import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { domainEvents } from '../database/schema';

export type DomainEventActor = 'system' | 'user' | 'bot' | 'channel';

export interface AppendEventInput {
  type: string;
  aggregateType: string;
  aggregateId: string;
  actor: DomainEventActor;
  payload?: Record<string, unknown>;
  /** Solo para hechos importados con fecha propia; por defecto, ahora (UTC). */
  occurredAt?: Date;
}

export interface QueryEventsInput {
  type?: string;
  aggregateType?: string;
  aggregateId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export type DomainEvent = typeof domainEvents.$inferSelect;

/**
 * Única vía de escritura al event log (append-only). Todas las métricas y la
 * auditoría del producto derivan de estos eventos — nunca de contadores ad hoc.
 */
@Injectable()
export class DomainEventsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async append(input: AppendEventInput): Promise<DomainEvent> {
    const rows = await this.db
      .insert(domainEvents)
      .values({
        type: input.type,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actor: input.actor,
        payload: input.payload ?? {},
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      })
      .returning();
    const event = rows[0];
    if (!event) {
      throw new Error('Insert into domain_events returned no row');
    }
    return event;
  }

  async query(input: QueryEventsInput): Promise<DomainEvent[]> {
    const conditions = [
      input.type ? eq(domainEvents.type, input.type) : undefined,
      input.aggregateType ? eq(domainEvents.aggregateType, input.aggregateType) : undefined,
      input.aggregateId ? eq(domainEvents.aggregateId, input.aggregateId) : undefined,
      input.from ? gte(domainEvents.occurredAt, input.from) : undefined,
      input.to ? lte(domainEvents.occurredAt, input.to) : undefined,
    ].filter((c) => c !== undefined);

    return this.db
      .select()
      .from(domainEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(domainEvents.occurredAt))
      .limit(input.limit ?? 1000);
  }
}
