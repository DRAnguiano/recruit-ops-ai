import { Controller, Get, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { SQL_CLIENT, SqlClient } from '../database/database.module';
import { REDIS } from '../redis/redis.module';

interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.sql`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      await this.redis.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
