import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { loadEnv } from '../config/env';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (): Redis =>
        new Redis(loadEnv().REDIS_URL, {
          // BullMQ exige maxRetriesPerRequest: null en sus conexiones;
          // se usa la misma configuración para toda la app.
          maxRetriesPerRequest: null,
        }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
