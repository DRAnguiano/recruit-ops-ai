import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueRegistryService } from '../src/jobs/queue-registry.service';
import { REDIS_URL } from './helpers';

describe('colas BullMQ (background-jobs)', () => {
  let redis: Redis;
  let registry: QueueRegistryService;
  const runId = Date.now().toString(36);

  beforeAll(() => {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    registry = new QueueRegistryService(redis);
  });

  afterAll(async () => {
    await registry.onApplicationShutdown();
    await redis.quit();
  });

  it('registra cola con nombre prefijado por dominio y procesa un job end-to-end', async () => {
    const queue = registry.registerQueue('system', `example-${runId}`);
    expect(queue.name).toBe(`system.example-${runId}`);

    const processed = new Promise<string>((resolve) => {
      registry.registerWorker<{ value: string }>('system', `example-${runId}`, (job) => {
        resolve(job.data.value);
        return Promise.resolve();
      });
    });

    await queue.add('ping', { value: 'pong' });
    await expect(processed).resolves.toBe('pong');
  });

  it('retiene los jobs fallidos con su error', async () => {
    const queue = registry.registerQueue('system', `failing-${runId}`);
    const failed = new Promise<void>((resolve) => {
      const worker = registry.registerWorker('system', `failing-${runId}`, () => {
        return Promise.reject(new Error('falla intencional'));
      });
      worker.on('failed', () => resolve());
    });

    const job = await queue.add('boom', {});
    await failed;

    // pequeño margen para que BullMQ persista el estado final
    await new Promise((r) => setTimeout(r, 200));
    const failedJobs = await queue.getFailed();
    expect(failedJobs.map((j) => j.id)).toContain(job.id);
    expect(failedJobs.find((j) => j.id === job.id)?.failedReason).toContain('falla intencional');
  });

  it('rechaza registrar dos veces la misma cola', () => {
    registry.registerQueue('system', `dup-${runId}`);
    expect(() => registry.registerQueue('system', `dup-${runId}`)).toThrowError(
      /ya está registrada/,
    );
  });
});
