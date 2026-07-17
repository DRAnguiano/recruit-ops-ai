import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { resetEnvCache } from '../src/config/env';
import { configureApp } from '../src/setup-app';
import { HealthController } from '../src/health/health.controller';
import { createEphemeralDatabase, EphemeralDatabase, REDIS_URL } from './helpers';

describe('bootstrap de la app (backend-foundation)', () => {
  let ephemeral: EphemeralDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    ephemeral = await createEphemeralDatabase();
    process.env.DATABASE_URL = ephemeral.url;
    process.env.REDIS_URL = REDIS_URL;
    process.env.NODE_ENV = 'test';
    resetEnvCache();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    app.enableShutdownHooks();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await ephemeral.drop();
  });

  it('la app arranca y /health reporta base de datos y redis ok', async () => {
    const health = app.get(HealthController);
    const report = await health.check();
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ database: 'ok', redis: 'ok' });
  });
});
