import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { DomainError, notFound } from '../common/domain-error';
import { DomainEventsService } from '../events/domain-events.service';
import {
  leadFieldDefinitions,
  leadFieldValues,
  leads,
  people,
  personFieldDefinitions,
  personFieldValues,
} from '../database/schema';
import { FieldEntity } from './field-definitions.service';

export type FieldSource = 'human' | 'ai';

interface FieldDefinitionRow {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
}

export interface FieldValueView {
  key: string;
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
  value: unknown;
  source: FieldSource | null;
  evidenceText: string | null;
  evidenceMessageId: string | null;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  definitions: FieldDefinitionRow[];
  expiresAt: number;
}

/**
 * Lectura/escritura de valores de campos personalizados, con evidencia
 * (custom-fields, design decisión 5). El endpoint público siempre llama a
 * `setValue` con `source: 'human'`; el servicio aplica la precedencia
 * (un `ai` nunca pisa un `human`) sin importar quién llame.
 */
@Injectable()
export class FieldValuesService {
  private readonly cache = new Map<FieldEntity, CacheEntry>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * `evidence` sólo lo usará el futuro camino interno con `source: 'ai'` (no
   * expuesto en este change); el endpoint público llama sin ese argumento.
   */
  async setValue(
    entity: FieldEntity,
    entityId: string,
    key: string,
    rawValue: unknown,
    source: FieldSource,
    evidence?: { evidenceText?: string; evidenceMessageId?: string },
  ): Promise<FieldValueView> {
    await this.assertEntityExists(entity, entityId);
    const definition = await this.getActiveDefinition(entity, key);
    const value = this.validateValue(definition, rawValue);

    const existing =
      entity === 'lead'
        ? await this.db.query.leadFieldValues.findFirst({
            where: and(
              eq(leadFieldValues.definitionId, definition.id),
              eq(leadFieldValues.leadId, entityId),
            ),
          })
        : await this.db.query.personFieldValues.findFirst({
            where: and(
              eq(personFieldValues.definitionId, definition.id),
              eq(personFieldValues.personId, entityId),
            ),
          });

    if (existing && existing.source === 'human' && source === 'ai') {
      // Precedencia (design decisión 5): la IA nunca pisa una corrección humana.
      return this.toView(definition, existing);
    }

    const row =
      entity === 'lead'
        ? await this.upsertLeadValue(existing?.id, definition.id, entityId, value, source, evidence)
        : await this.upsertPersonValue(
            existing?.id,
            definition.id,
            entityId,
            value,
            source,
            evidence,
          );

    await this.events.append({
      type: `${entity}_field.value_set`,
      aggregateType: `${entity}_field_value`,
      aggregateId: row.id,
      actor: 'user',
      payload: { definitionId: definition.id, entityId, key, source },
    });

    return this.toView(definition, row);
  }

  async listValues(entity: FieldEntity, entityId: string): Promise<FieldValueView[]> {
    await this.assertEntityExists(entity, entityId);

    if (entity === 'lead') {
      const rows = await this.db
        .select({ definition: leadFieldDefinitions, value: leadFieldValues })
        .from(leadFieldDefinitions)
        .leftJoin(
          leadFieldValues,
          and(
            eq(leadFieldValues.definitionId, leadFieldDefinitions.id),
            eq(leadFieldValues.leadId, entityId),
          ),
        )
        .where(eq(leadFieldDefinitions.active, true))
        .orderBy(asc(leadFieldDefinitions.sortOrder), asc(leadFieldDefinitions.key));
      return rows.map((r) => this.toView(r.definition, r.value));
    }

    const rows = await this.db
      .select({ definition: personFieldDefinitions, value: personFieldValues })
      .from(personFieldDefinitions)
      .leftJoin(
        personFieldValues,
        and(
          eq(personFieldValues.definitionId, personFieldDefinitions.id),
          eq(personFieldValues.personId, entityId),
        ),
      )
      .where(eq(personFieldDefinitions.active, true))
      .orderBy(asc(personFieldDefinitions.sortOrder), asc(personFieldDefinitions.key));
    return rows.map((r) => this.toView(r.definition, r.value));
  }

  // ── Internos ────────────────────────────────────────────────────────────

  private async upsertLeadValue(
    existingId: string | undefined,
    definitionId: string,
    leadId: string,
    value: unknown,
    source: FieldSource,
    evidence?: { evidenceText?: string; evidenceMessageId?: string },
  ) {
    if (existingId) {
      const [row] = await this.db
        .update(leadFieldValues)
        .set({
          value,
          source,
          evidenceText: evidence?.evidenceText ?? null,
          evidenceMessageId: evidence?.evidenceMessageId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(leadFieldValues.id, existingId))
        .returning();
      return row!;
    }
    const [row] = await this.db
      .insert(leadFieldValues)
      .values({
        definitionId,
        leadId,
        value,
        source,
        evidenceText: evidence?.evidenceText,
        evidenceMessageId: evidence?.evidenceMessageId,
      })
      .returning();
    return row!;
  }

  private async upsertPersonValue(
    existingId: string | undefined,
    definitionId: string,
    personId: string,
    value: unknown,
    source: FieldSource,
    evidence?: { evidenceText?: string; evidenceMessageId?: string },
  ) {
    if (existingId) {
      const [row] = await this.db
        .update(personFieldValues)
        .set({
          value,
          source,
          evidenceText: evidence?.evidenceText ?? null,
          evidenceMessageId: evidence?.evidenceMessageId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(personFieldValues.id, existingId))
        .returning();
      return row!;
    }
    const [row] = await this.db
      .insert(personFieldValues)
      .values({
        definitionId,
        personId,
        value,
        source,
        evidenceText: evidence?.evidenceText,
        evidenceMessageId: evidence?.evidenceMessageId,
      })
      .returning();
    return row!;
  }

  private async assertEntityExists(entity: FieldEntity, entityId: string): Promise<void> {
    const row =
      entity === 'lead'
        ? await this.db.query.leads.findFirst({ where: eq(leads.id, entityId), columns: { id: true } })
        : await this.db.query.people.findFirst({ where: eq(people.id, entityId), columns: { id: true } });
    if (!row) {
      throw notFound(
        `${entity.toUpperCase()}_NOT_FOUND`,
        `No existe ${entity} con id ${entityId}`,
      );
    }
  }

  private async getActiveDefinition(entity: FieldEntity, key: string): Promise<FieldDefinitionRow> {
    const definitions = await this.activeDefinitions(entity);
    const definition = definitions.find((d) => d.key === key);
    if (!definition) {
      throw notFound(
        `${entity.toUpperCase()}_FIELD_DEFINITION_NOT_FOUND`,
        `No existe (o no está activa) la definición de campo ${entity} "${key}"`,
      );
    }
    return definition;
  }

  private async activeDefinitions(entity: FieldEntity): Promise<FieldDefinitionRow[]> {
    const cached = this.cache.get(entity);
    if (cached && cached.expiresAt > Date.now()) return cached.definitions;

    const table = entity === 'lead' ? leadFieldDefinitions : personFieldDefinitions;
    const rows = (await this.db
      .select()
      .from(table)
      .where(eq(table.active, true))) as FieldDefinitionRow[];
    this.cache.set(entity, { definitions: rows, expiresAt: Date.now() + CACHE_TTL_MS });
    return rows;
  }

  /** Invalidar tras mutar el diccionario (llamado desde FieldDefinitionsService). */
  invalidate(entity: FieldEntity): void {
    this.cache.delete(entity);
  }

  private validateValue(definition: FieldDefinitionRow, rawValue: unknown): unknown {
    const invalid = (): never => {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Valor inválido para el campo "${definition.key}" (tipo ${definition.type})`,
        400,
        definition.type === 'select' ? { allowed: definition.options } : undefined,
      );
    };

    switch (definition.type) {
      case 'number': {
        const n = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (typeof rawValue === 'boolean' || !Number.isFinite(n)) invalid();
        return n;
      }
      case 'boolean':
        if (typeof rawValue !== 'boolean') invalid();
        return rawValue;
      case 'date': {
        if (typeof rawValue !== 'string' || Number.isNaN(Date.parse(rawValue))) invalid();
        return rawValue;
      }
      case 'select': {
        if (typeof rawValue !== 'string' || !(definition.options ?? []).includes(rawValue)) {
          invalid();
        }
        return rawValue;
      }
      case 'text':
      default:
        if (typeof rawValue !== 'string') invalid();
        return rawValue;
    }
  }

  private toView(
    definition: FieldDefinitionRow,
    value?: {
      value: unknown;
      source: string;
      evidenceText: string | null;
      evidenceMessageId: string | null;
    } | null,
  ): FieldValueView {
    return {
      key: definition.key,
      label: definition.label,
      type: definition.type,
      options: definition.options,
      required: definition.required,
      value: value?.value ?? null,
      source: (value?.source as FieldSource) ?? null,
      evidenceText: value?.evidenceText ?? null,
      evidenceMessageId: value?.evidenceMessageId ?? null,
    };
  }
}
