import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB, Database } from '../database/database.module';
import { appSettings } from '../database/schema';
import { notFound } from '../common/domain-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DomainEventsService } from '../events/domain-events.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Registro de settings operativos editables por UI: cada clave declara su
 * schema y su default. Claves fuera del registro no son editables por API.
 */
const SETTINGS_REGISTRY: Record<string, { schema: z.ZodType; defaultValue: unknown }> = {
  conversation_inactivity_days: {
    schema: z.number().int().positive().max(365),
    defaultValue: 21,
  },
  campaign_sync_interval_minutes: {
    schema: z.number().int().min(5).max(1440),
    defaultValue: 60,
  },
};

const putBodySchema = z.object({ value: z.unknown() });

@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly events: DomainEventsService,
  ) {}

  @Get()
  async list(): Promise<Record<string, unknown>> {
    const rows = await this.db.select().from(appSettings);
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(
      Object.entries(SETTINGS_REGISTRY).map(([key, def]) => [
        key,
        stored.get(key) ?? def.defaultValue,
      ]),
    );
  }

  @Put(':key')
  async put(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(putBodySchema)) body: z.infer<typeof putBodySchema>,
  ): Promise<{ key: string; value: unknown }> {
    const def = SETTINGS_REGISTRY[key];
    if (!def) throw notFound('SETTING_NOT_FOUND', `Setting desconocido: ${key}`);

    const value = new ZodValidationPipe(def.schema).transform(body.value);

    const previous = await this.db.query.appSettings.findFirst({
      where: eq(appSettings.key, key),
    });
    await this.db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
    this.settings.invalidateCache();

    await this.events.append({
      type: 'setting.updated',
      aggregateType: 'setting',
      aggregateId: key,
      actor: 'user',
      payload: { value, previousValue: previous?.value ?? null },
    });

    return { key, value };
  }
}
