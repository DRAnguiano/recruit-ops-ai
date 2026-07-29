import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { workSchedules } from '../database/schema';
import { WorkScheduleLike } from './work-hours';

const CACHE_TTL_MS = 60_000;

const FALLBACK: WorkScheduleLike = {
  workDays: [1, 2, 3, 4, 5],
  startTime: '07:30',
  endTime: '17:30',
  timezone: 'America/Mexico_City',
};

@Injectable()
export class SchedulesService {
  private cached: { value: WorkScheduleLike; at: number } | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Horario por defecto (fila seed `default`); cache corto para no golpear DB por mensaje. */
  async getDefaultSchedule(): Promise<WorkScheduleLike> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.value;
    }
    const row = await this.db.query.workSchedules.findFirst({
      where: eq(workSchedules.name, 'default'),
    });
    const value: WorkScheduleLike = row
      ? {
          workDays: row.workDays,
          startTime: row.startTime,
          endTime: row.endTime,
          timezone: row.timezone,
        }
      : FALLBACK;
    this.cached = { value, at: Date.now() };
    return value;
  }
}
