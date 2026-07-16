import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { runMigrations } from '../src/database/migrate';

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
