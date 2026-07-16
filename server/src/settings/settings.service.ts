import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { appSettings } from '../database/schema';

const CACHE_TTL_MS = 60_000;

/** Configuración operativa clave→valor (app_settings) con cache corto. */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();

  constructor(@Inject(DB) private readonly db: Database) {}

  async getNumber(key: string, fallback: number): Promise<number> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return typeof cached.value === 'number' ? cached.value : fallback;
    }
    const row = await this.db.query.appSettings.findFirst({
      where: eq(appSettings.key, key),
    });
    const value = row?.value;
    this.cache.set(key, { value, at: Date.now() });
    return typeof value === 'number' ? value : fallback;
  }

  /** Solo para tests. */
  invalidateCache(): void {
    this.cache.clear();
  }
}
