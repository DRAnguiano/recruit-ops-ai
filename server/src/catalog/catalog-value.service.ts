import { Inject, Injectable } from '@nestjs/common';
import { PgTable } from 'drizzle-orm/pg-core';
import { DB, Database } from '../database/database.module';
import { DomainError } from '../common/domain-error';
import { circuits, companies, leadStatuses, vacancyTypes } from '../database/schema';

export type CatalogKind = 'company' | 'circuit' | 'vacancy_type' | 'lead_status';

const TABLE_BY_KIND: Record<CatalogKind, PgTable> = {
  company: companies,
  circuit: circuits,
  vacancy_type: vacancyTypes,
  lead_status: leadStatuses,
};

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  names: Set<string>;
  expiresAt: number;
}

/**
 * Valores de dominio válidos según catálogo (configurable-catalogs): nunca
 * enums en código. Cache de 60 s por catálogo (mismo TTL que settings y
 * reglas); las mutaciones del CRUD invalidan para que lo recién creado sea
 * usable de inmediato en el mismo proceso.
 */
@Injectable()
export class CatalogValueService {
  private readonly cache = new Map<CatalogKind, CacheEntry>();

  constructor(@Inject(DB) private readonly db: Database) {}

  async activeNames(kind: CatalogKind): Promise<Set<string>> {
    const cached = this.cache.get(kind);
    if (cached && cached.expiresAt > Date.now()) return cached.names;

    const rows = (await this.db.select().from(TABLE_BY_KIND[kind])) as Array<{
      name: string;
      active: boolean;
    }>;
    const names = new Set(rows.filter((r) => r.active).map((r) => r.name));
    this.cache.set(kind, { names, expiresAt: Date.now() + CACHE_TTL_MS });
    return names;
  }

  async isValid(kind: CatalogKind, name: string): Promise<boolean> {
    return (await this.activeNames(kind)).has(name);
  }

  /** 400 VALIDATION_ERROR con los permitidos si `name` no está en el catálogo. */
  async assertValid(kind: CatalogKind, field: string, name: string): Promise<void> {
    const allowed = await this.activeNames(kind);
    if (!allowed.has(name)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Valor fuera del catálogo para ${field}`,
        400,
        {
          issues: [
            {
              path: field,
              message: `"${name}" no está en el catálogo; permitidos: ${[...allowed].sort().join(', ')}`,
            },
          ],
        },
      );
    }
  }

  invalidate(kind: CatalogKind): void {
    this.cache.delete(kind);
  }
}
