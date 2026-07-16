import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job, Processor, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { DomainError } from '../common/domain-error';
import { REDIS } from '../redis/redis.module';

/**
 * Patrón único de colas por dominio (design.md, decisión 5): cada módulo
 * registra sus colas aquí con nombre prefijado `dominio.cola`
 * (p. ej. `campaigns.sync`, `channels.outbound`).
 *
 * - Los jobs fallidos se retienen con su error (nunca auto-borrados).
 * - Todo fallo de worker se loggea con nombre de cola + job id.
 * - Queues y workers se cierran ordenadamente al apagar la app.
 */
@Injectable()
export class QueueRegistryService implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueRegistryService.name);
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly workerConnections: Redis[] = [];

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  registerQueue(domain: string, name: string): Queue {
    const fullName = this.fullName(domain, name);
    const existing = this.queues.get(fullName);
    if (existing) {
      throw new DomainError('QUEUE_ALREADY_REGISTERED', `La cola ${fullName} ya está registrada`);
    }
    const queue = new Queue(fullName, {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      },
    });
    this.queues.set(fullName, queue);
    return queue;
  }

  registerWorker<T>(domain: string, name: string, processor: Processor<T>): Worker<T> {
    const fullName = this.fullName(domain, name);
    // Conexión propia por worker (duplicada): permite cerrarla explícitamente
    // tras worker.close() sin carreras con la conexión compartida al apagar.
    const connection = this.redis.duplicate();
    const worker = new Worker<T>(fullName, processor, { connection });
    worker.on('failed', (job: Job<T> | undefined, error: Error) => {
      this.logger.error(`Job fallido en cola=${fullName} job=${job?.id ?? '?'}: ${error.message}`);
    });
    worker.on('error', (error: Error) => {
      this.logger.error(`Error de worker en cola=${fullName}: ${error.message}`);
    });
    this.workers.push(worker as Worker);
    this.workerConnections.push(connection);
    return worker;
  }

  getQueue(domain: string, name: string): Queue | undefined {
    return this.queues.get(this.fullName(domain, name));
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(
      this.workerConnections.map((c) => c.quit().catch(() => c.disconnect())),
    );
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }

  private fullName(domain: string, name: string): string {
    if (!domain || !name) {
      throw new DomainError('QUEUE_NAME_INVALID', 'Dominio y nombre de cola son obligatorios');
    }
    return `${domain}.${name}`;
  }
}
