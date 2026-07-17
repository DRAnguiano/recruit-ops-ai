import { Controller, HttpCode, Post } from '@nestjs/common';
import { DomainError } from '../common/domain-error';
import { DomainEventsService } from '../events/domain-events.service';
import { CampaignSyncQueue } from './campaign-sync.queue';
import { MarketingApiClient } from './marketing-api.client';

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly queue: CampaignSyncQueue,
    private readonly client: MarketingApiClient,
    private readonly events: DomainEventsService,
  ) {}

  /** Disparo manual del sync (para el botón de la UI). */
  @Post('sync')
  @HttpCode(202)
  async syncNow(): Promise<{ queued: true }> {
    if (!this.client.isConfigured()) {
      throw new DomainError(
        'MARKETING_NOT_CONFIGURED',
        'Configura META_ADS_ACCESS_TOKEN y META_AD_ACCOUNT_ID para sincronizar campañas',
        409,
      );
    }
    await this.queue.enqueueNow();
    await this.events.append({
      type: 'campaign.sync_requested',
      aggregateType: 'campaign',
      aggregateId: 'sync',
      actor: 'user',
      payload: {},
    });
    return { queued: true };
  }
}
