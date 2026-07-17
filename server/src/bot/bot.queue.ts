import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { messages } from '../database/schema';
import { DomainEvent, DomainEventsService } from '../events/domain-events.service';
import { QueueRegistryService } from '../jobs/queue-registry.service';
import { BotNotifierService } from './bot-notifier.service';

interface NotifyJobData {
  messageId: string;
}

/**
 * Cola `bot.notify` (bot-gateway spec): se alimenta de los eventos de dominio
 * ya persistidos (post-commit por construcción). Texto notifica al ingerirse;
 * media espera a `message.media_stored` para que el bot reciba el binario
 * descargable. Un bot caído solo deja jobs failed — jamás toca la ingestión.
 */
@Injectable()
export class BotQueue implements OnModuleInit {
  private readonly logger = new Logger(BotQueue.name);
  private queue!: Queue;
  private readonly suffix = process.env.QUEUE_SUFFIX ?? '';

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly registry: QueueRegistryService,
    private readonly events: DomainEventsService,
    private readonly notifier: BotNotifierService,
  ) {}

  onModuleInit(): void {
    this.queue = this.registry.registerQueue('bot', `notify${this.suffix}`);
    this.registry.registerWorker<NotifyJobData>(
      'bot',
      `notify${this.suffix}`,
      async (job: Job<NotifyJobData>) => {
        await this.notifier.notify(job.data.messageId);
      },
    );

    this.events.subscribe((event) => {
      void this.onEvent(event).catch((error) => {
        this.logger.error(`Encolado de notificación al bot falló: ${String(error)}`);
      });
    });
  }

  private async onEvent(event: DomainEvent): Promise<void> {
    if (event.type !== 'message.received' && event.type !== 'message.media_stored') return;
    if (!this.notifier.isConfigured()) return;

    const message = await this.db.query.messages.findFirst({
      where: eq(messages.id, event.aggregateId),
    });
    if (!message || message.direction !== 'inbound') return;
    // La media notifica cuando su binario ya es descargable, no antes.
    if (event.type === 'message.received' && message.media) return;

    if (!(await this.notifier.shouldNotify(message.conversationId))) return;

    await this.queue.add(
      'notify',
      { messageId: message.id },
      {
        jobId: message.id,
        attempts: Number(process.env.BOT_NOTIFY_ATTEMPTS ?? 5),
        backoff: {
          type: 'exponential',
          delay: Number(process.env.BOT_NOTIFY_BACKOFF_MS ?? 1000),
        },
      },
    );
  }
}
