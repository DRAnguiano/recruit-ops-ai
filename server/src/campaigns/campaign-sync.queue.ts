import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueRegistryService } from '../jobs/queue-registry.service';
import { SettingsService } from '../settings/settings.service';
import { CampaignSyncService } from './campaign-sync.service';
import { MarketingApiClient } from './marketing-api.client';

export const SYNC_INTERVAL_SETTING = 'campaign_sync_interval_minutes';
const DEFAULT_INTERVAL_MINUTES = 60;

/**
 * Cola `campaigns.sync`: job repetible con intervalo desde settings + corridas
 * manuales encoladas por la API. El scheduler se re-upserta tras cada corrida,
 * así un cambio del setting se aplica solo (self-healing, design decisión 3).
 */
@Injectable()
export class CampaignSyncQueue implements OnApplicationBootstrap {
  private readonly logger = new Logger(CampaignSyncQueue.name);
  private queue!: Queue;
  private readonly suffix = process.env.QUEUE_SUFFIX ?? '';

  constructor(
    private readonly registry: QueueRegistryService,
    private readonly sync: CampaignSyncService,
    private readonly settings: SettingsService,
    private readonly client: MarketingApiClient,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.queue = this.registry.registerQueue('campaigns', `sync${this.suffix}`);
    this.registry.registerWorker('campaigns', `sync${this.suffix}`, async () => {
      await this.sync.run();
      await this.upsertScheduler();
    });
    await this.upsertScheduler();
  }

  /** Corrida inmediata (dedup por minuto: reintentos de UI no acumulan jobs). */
  async enqueueNow(): Promise<void> {
    await this.queue.add(
      'sync',
      {},
      { jobId: `manual_${Math.floor(Date.now() / 60_000)}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }

  private async upsertScheduler(): Promise<void> {
    // Sin credenciales no hay nada que programar (y el scheduler de BullMQ
    // encola una corrida inmediata al registrarse — sería ruido de no-ops).
    if (!this.client.isConfigured()) return;
    try {
      const minutes = await this.settings.getNumber(
        SYNC_INTERVAL_SETTING,
        DEFAULT_INTERVAL_MINUTES,
      );
      await this.queue.upsertJobScheduler('periodic', { every: minutes * 60_000 });
    } catch (error) {
      this.logger.warn(`No se pudo programar el sync periódico: ${String(error)}`);
    }
  }
}
