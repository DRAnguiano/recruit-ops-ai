import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { LeadsModule } from '../leads/leads.module';
import { SettingsModule } from '../settings/settings.module';
import { CampaignSyncQueue } from './campaign-sync.queue';
import { CampaignSyncService } from './campaign-sync.service';
import { CampaignsController } from './campaigns.controller';
import { MarketingApiClient } from './marketing-api.client';

/**
 * Sync read-only de campañas con Meta Marketing API (campaign-sync spec).
 * El CRUD plano de campañas sigue en catalog; aquí vive la lógica con reglas.
 */
@Module({
  imports: [JobsModule, LeadsModule, SettingsModule],
  controllers: [CampaignsController],
  providers: [MarketingApiClient, CampaignSyncService, CampaignSyncQueue],
})
export class CampaignsModule {}
