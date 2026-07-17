import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { AppModule } from '../src/app.module';
import { resetEnvCache } from '../src/config/env';
import * as schema from '../src/database/schema';
import { runMigrations } from '../src/database/migrate';
import { configureApp } from '../src/setup-app';

const BASE_URL = process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/crm_reclutamiento';

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Espera hasta que `check` devuelva truthy (poll de 100 ms) o agota el timeout. */
export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error('waitFor: timeout esperando la condición');
    await new Promise((r) => setTimeout(r, 100));
  }
}

export interface EphemeralDatabase {
  url: string;
  drop: () => Promise<void>;
}

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  db: ReturnType<typeof drizzle<typeof schema>>;
  cleanup: () => Promise<void>;
}

/**
 * Arranca la app completa (AppModule + configureApp: prefijo /api, CORS,
 * filtros, adaptador WS) contra una base efímera, igual que producción.
 */
export async function bootTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const ephemeral = await createEphemeralDatabase();
  process.env.DATABASE_URL = ephemeral.url;
  process.env.REDIS_URL = REDIS_URL;
  process.env.NODE_ENV = 'test';
  process.env.QUEUE_SUFFIX = `-t${randomBytes(4).toString('hex')}`;
  Object.assign(process.env, env);
  resetEnvCache();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');

  const client = postgres(ephemeral.url);
  const db = drizzle(client, { schema });

  return {
    app,
    baseUrl,
    db,
    cleanup: async (): Promise<void> => {
      await client.end({ timeout: 5 });
      await app.close();
      await ephemeral.drop();
    },
  };
}

/** Crea una base de datos efímera con las migraciones aplicadas y la borra al final. */
export async function createEphemeralDatabase(): Promise<EphemeralDatabase> {
  const name = `test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(BASE_URL, { max: 1 });
  await admin.unsafe(`CREATE DATABASE ${name}`);

  const url = new URL(BASE_URL);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());

  return {
    url: url.toString(),
    drop: async (): Promise<void> => {
      await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    },
  };
}
