import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QueueRegistryService } from '../jobs/queue-registry.service';
import { NormalizedInboundMessage } from './channel-adapter';
import { MessageDelivery } from '../database/schema';
import { MediaDownloadService } from './media/media-download.service';
import { MessageIngestionService } from './message-ingestion.service';
import { OutboundService } from './outbound.service';

/** Mensaje normalizado serializado para BullMQ (Date → ISO). */
type InboundJobData = Omit<NormalizedInboundMessage, 'sentAt'> & { sentAt: string };

interface MediaJobData {
  messageId: string;
}

interface OutboundJobData {
  messageId: string;
}

export interface DeliveryStatusJob {
  channel: string;
  externalMessageId: string;
  status: MessageDelivery['status'];
  error?: string;
}

const MEDIA_ATTEMPTS = 5;
const OUTBOUND_ATTEMPTS = 5;

/**
 * Colas del dominio channels (design add-media-messages, decisiones 3-4):
 * - `channels.inbound`: el webhook encola tras autenticar; el worker ejecuta
 *   la MISMA ingestión idempotente. jobId = <canal>__<id externo> →
 *   dedup en cola; la unique de Postgres sigue siendo la garantía final.
 * - `channels.media`: descarga del binario por mensaje con media, con
 *   backoff exponencial; al agotar reintentos marca `failed`.
 *
 * El sufijo de nombre (QUEUE_SUFFIX) existe solo para aislar suites de test
 * que comparten Redis; en producción queda vacío.
 */
@Injectable()
export class ChannelQueuesService implements OnModuleInit {
  private readonly logger = new Logger(ChannelQueuesService.name);
  private inboundQueue!: Queue;
  private mediaQueue!: Queue;
  private outboundQueue!: Queue;
  private statusQueue!: Queue;
  private readonly suffix = process.env.QUEUE_SUFFIX ?? '';

  constructor(
    private readonly registry: QueueRegistryService,
    private readonly ingestion: MessageIngestionService,
    private readonly mediaDownload: MediaDownloadService,
    private readonly outbound: OutboundService,
  ) {}

  onModuleInit(): void {
    this.inboundQueue = this.registry.registerQueue('channels', `inbound${this.suffix}`);
    this.mediaQueue = this.registry.registerQueue('channels', `media${this.suffix}`);
    this.outboundQueue = this.registry.registerQueue('channels', `outbound${this.suffix}`);
    this.statusQueue = this.registry.registerQueue('channels', `status${this.suffix}`);

    this.registry.registerWorker<InboundJobData>(
      'channels',
      `inbound${this.suffix}`,
      async (job) => {
        const inbound: NormalizedInboundMessage = {
          ...job.data,
          sentAt: new Date(job.data.sentAt),
        };
        const results = await this.ingestion.ingest([inbound]);
        for (const result of results) {
          if (result.hasMedia) await this.enqueueMedia(result.messageId);
        }
      },
    );

    this.registry.registerWorker<MediaJobData>(
      'channels',
      `media${this.suffix}`,
      async (job: Job<MediaJobData>) => {
        try {
          await this.mediaDownload.process(job.data.messageId);
        } catch (error) {
          const attempts = job.opts.attempts ?? 1;
          if (job.attemptsMade + 1 >= attempts) {
            await this.mediaDownload.markFailed(job.data.messageId, String(error));
            this.logger.error(
              `Media agotó reintentos: mensaje ${job.data.messageId}: ${String(error)}`,
            );
          }
          throw error;
        }
      },
    );

    this.registry.registerWorker<OutboundJobData>(
      'channels',
      `outbound${this.suffix}`,
      async (job: Job<OutboundJobData>) => {
        try {
          await this.outbound.deliver(job.data.messageId);
        } catch (error) {
          const attempts = job.opts.attempts ?? 1;
          if (job.attemptsMade + 1 >= attempts) {
            await this.outbound.markFailed(job.data.messageId, String(error));
            this.logger.error(
              `Envío agotó reintentos: mensaje ${job.data.messageId}: ${String(error)}`,
            );
          }
          throw error;
        }
      },
    );

    this.registry.registerWorker<DeliveryStatusJob>(
      'channels',
      `status${this.suffix}`,
      async (job: Job<DeliveryStatusJob>) => {
        const { channel, externalMessageId, status, error } = job.data;
        await this.outbound.applyDeliveryStatus(channel, externalMessageId, status, error);
      },
    );
  }

  async enqueueInbound(messages: NormalizedInboundMessage[]): Promise<void> {
    for (const message of messages) {
      const data: InboundJobData = { ...message, sentAt: message.sentAt.toISOString() };
      // BullMQ prohíbe ':' en jobIds custom → separador '__'.
      await this.inboundQueue.add('ingest', data, {
        jobId: `${message.channel}__${message.externalMessageId.replaceAll(':', '_')}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      });
    }
  }

  async enqueueOutbound(messageId: string): Promise<void> {
    await this.outboundQueue.add(
      'send',
      { messageId },
      {
        jobId: messageId,
        attempts: Number(process.env.OUTBOUND_JOB_ATTEMPTS ?? OUTBOUND_ATTEMPTS),
        backoff: {
          type: 'exponential',
          delay: Number(process.env.OUTBOUND_JOB_BACKOFF_MS ?? 1000),
        },
      },
    );
  }

  async enqueueDeliveryStatuses(statuses: DeliveryStatusJob[]): Promise<void> {
    for (const status of statuses) {
      await this.statusQueue.add('apply', status, {
        // Dedup por mensaje+estado: reintentos de Meta no re-aplican nada.
        jobId: `${status.channel}__${status.externalMessageId.replaceAll(':', '_')}__${status.status}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      });
    }
  }

  async enqueueMedia(messageId: string): Promise<void> {
    await this.mediaQueue.add(
      'download',
      { messageId },
      {
        jobId: messageId,
        attempts: Number(process.env.MEDIA_JOB_ATTEMPTS ?? MEDIA_ATTEMPTS),
        backoff: { type: 'exponential', delay: Number(process.env.MEDIA_JOB_BACKOFF_MS ?? 1000) },
      },
    );
  }
}
