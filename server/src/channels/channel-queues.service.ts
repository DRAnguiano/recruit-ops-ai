import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QueueRegistryService } from '../jobs/queue-registry.service';
import { NormalizedInboundMessage } from './channel-adapter';
import { MediaDownloadService } from './media/media-download.service';
import { MessageIngestionService } from './message-ingestion.service';

/** Mensaje normalizado serializado para BullMQ (Date → ISO). */
type InboundJobData = Omit<NormalizedInboundMessage, 'sentAt'> & { sentAt: string };

interface MediaJobData {
  messageId: string;
}

const MEDIA_ATTEMPTS = 5;

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
  private readonly suffix = process.env.QUEUE_SUFFIX ?? '';

  constructor(
    private readonly registry: QueueRegistryService,
    private readonly ingestion: MessageIngestionService,
    private readonly mediaDownload: MediaDownloadService,
  ) {}

  onModuleInit(): void {
    this.inboundQueue = this.registry.registerQueue('channels', `inbound${this.suffix}`);
    this.mediaQueue = this.registry.registerQueue('channels', `media${this.suffix}`);

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
