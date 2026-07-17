import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { campaigns } from '../database/schema';
import { DomainEventsService } from '../events/domain-events.service';
import { LeadPipelineService } from '../leads/lead-pipeline.service';
import { MarketingApiClient, RemoteCampaignInsights } from './marketing-api.client';

export interface SyncResult {
  skipped: boolean;
  created: number;
  updated: number;
  reattributed: number;
}

/**
 * Sync read-only de campañas (campaign-sync spec): upsert por externalId con
 * datos reales de Meta. Solo toca campos que Meta posee; los campos locales
 * de negocio (targetAgentId, vacancyId, modality, pauseRequestedAt) y las
 * campañas sin externalId son intocables. Nunca inventa datos.
 */
@Injectable()
export class CampaignSyncService {
  private readonly logger = new Logger(CampaignSyncService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    private readonly client: MarketingApiClient,
    private readonly leadPipeline: LeadPipelineService,
  ) {}

  async run(): Promise<SyncResult> {
    if (!this.client.isConfigured()) {
      this.logger.log('Sync de campañas deshabilitado: falta META_ADS_ACCESS_TOKEN/META_AD_ACCOUNT_ID');
      return { skipped: true, created: 0, updated: 0, reattributed: 0 };
    }

    const [currency, remoteCampaigns, insights] = await Promise.all([
      this.client.getAccountCurrency(),
      this.client.listCampaigns(),
      this.client.listCampaignInsights(),
    ]);
    const insightsById = new Map<string, RemoteCampaignInsights>(
      insights.map((i) => [i.campaign_id, i]),
    );

    let created = 0;
    let updated = 0;
    for (const remote of remoteCampaigns) {
      const insight = insightsById.get(remote.id);
      // Solo campos que Meta posee (design decisión 2).
      const metaFields = {
        name: remote.name,
        source: 'meta_api',
        status: remote.status === 'ACTIVE' ? 'active' : 'paused',
        startDate: remote.start_time ? remote.start_time.slice(0, 10) : null,
        endDate: remote.stop_time ? remote.stop_time.slice(0, 10) : null,
        spend: Number(insight?.spend ?? 0).toFixed(2),
        currency,
        clicks: insight?.clicks !== undefined ? Number(insight.clicks) : null,
        leadsReported: MarketingApiClient.leadsFromInsights(insight),
        updatedAt: new Date(),
      };

      const existing = await this.db.query.campaigns.findFirst({
        where: eq(campaigns.externalId, remote.id),
      });
      if (existing) {
        await this.db.update(campaigns).set(metaFields).where(eq(campaigns.id, existing.id));
        updated += 1;
      } else {
        await this.db.insert(campaigns).values({ externalId: remote.id, ...metaFields });
        created += 1;
      }
    }

    // Los referrals huérfanos pueden matchear con las campañas recién traídas.
    const reattributed = await this.leadPipeline.reattributeOrphans();

    await this.events.append({
      type: 'campaign.synced',
      aggregateType: 'campaign',
      aggregateId: 'sync',
      actor: 'system',
      payload: { created, updated, reattributed, remoteTotal: remoteCampaigns.length, currency },
    });
    this.logger.log(
      `Sync de campañas: ${created} nuevas, ${updated} actualizadas, ${reattributed} leads re-atribuidos`,
    );
    return { skipped: false, created, updated, reattributed };
  }
}
