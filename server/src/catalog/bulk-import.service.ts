import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { DB, Database } from '../database/database.module';
import { campaigns, operators } from '../database/schema';
import { DomainEventsService } from '../events/domain-events.service';
import { campaignsBulkSchema, operatorsBulkSchema } from './catalog.schemas';

export interface BulkResult {
  created: number;
  updated: number;
}

type OperatorRow = z.infer<typeof operatorsBulkSchema>['items'][number];
export type CampaignRow = z.infer<typeof campaignsBulkSchema>['items'][number];

/**
 * Imports que sobreviven de la SPA (Excel de operadores, CSV de campañas):
 * el navegador parsea, el backend upserta por llave natural en una
 * transacción. Reimportar el mismo archivo es no-op seguro (idempotente).
 */
@Injectable()
export class BulkImportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
  ) {}

  /** Upsert por `empNo`. */
  async upsertOperators(items: OperatorRow[]): Promise<BulkResult> {
    const result = await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ empNo: operators.empNo })
        .from(operators)
        .where(inArray(operators.empNo, items.map((i) => i.empNo)));
      const existingKeys = new Set(existing.map((e) => e.empNo));

      let created = 0;
      const seen = new Set<string>();
      for (const item of items) {
        await tx
          .insert(operators)
          .values(item)
          .onConflictDoUpdate({
            target: operators.empNo,
            set: { ...item, updatedAt: new Date() },
          });
        if (!existingKeys.has(item.empNo) && !seen.has(item.empNo)) created += 1;
        seen.add(item.empNo);
      }
      return { created, updated: items.length - created };
    });

    await this.events.append({
      type: 'operator.bulk_upserted',
      aggregateType: 'operator',
      aggregateId: 'bulk',
      actor: 'user',
      payload: { ...result, total: items.length },
    });
    return result;
  }

  /** Upsert por `externalId` si existe; si no, por `name` + `isoWeek`. Marca source='csv'. */
  async upsertCampaigns(items: CampaignRow[]): Promise<BulkResult> {
    const result = await this.db.transaction(async (tx) => {
      let created = 0;
      let updated = 0;

      for (const item of items) {
        const values = { ...item, source: 'csv' };
        const match = item.externalId
          ? await tx.query.campaigns.findFirst({
              where: eq(campaigns.externalId, item.externalId),
            })
          : await tx.query.campaigns.findFirst({
              where: and(
                eq(campaigns.name, item.name),
                eq(campaigns.isoWeek, item.isoWeek ?? ''),
              ),
            });

        if (match) {
          await tx
            .update(campaigns)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(campaigns.id, match.id));
          updated += 1;
        } else {
          await tx.insert(campaigns).values(values);
          created += 1;
        }
      }
      return { created, updated };
    });

    await this.events.append({
      type: 'campaign.bulk_upserted',
      aggregateType: 'campaign',
      aggregateId: 'bulk',
      actor: 'user',
      payload: { ...result, total: items.length },
    });
    return result;
  }
}
