import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { classificationRules } from '../database/schema';
import { ClassificationRuleLike } from './classification-engine';

const CACHE_TTL_MS = 60_000;

/** Carga las reglas activas con cache corto: editar una regla aplica en ≤60 s sin redeploy. */
@Injectable()
export class ClassificationRulesService {
  private cached: { value: ClassificationRuleLike[]; at: number } | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  async getActiveRules(): Promise<ClassificationRuleLike[]> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.value;
    }
    const rows = await this.db
      .select()
      .from(classificationRules)
      .where(eq(classificationRules.active, true));
    const value = rows.map((r) => ({
      id: r.id,
      category: r.category,
      target: r.target,
      keywords: r.keywords,
      priority: r.priority,
    }));
    this.cached = { value, at: Date.now() };
    return value;
  }

  /** Solo para tests. */
  invalidateCache(): void {
    this.cached = null;
  }
}
