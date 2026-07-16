import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { loadDotenv } from '../config/load-dotenv';
import { loadEnv } from '../config/env';

/** Aplica las migraciones de `server/drizzle/` — único mecanismo de cambio de esquema. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (require.main === module) {
  loadDotenv();
  const env = loadEnv();
  runMigrations(env.DATABASE_URL)
    .then(() => {
      console.log('Migraciones aplicadas.');
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error('Error aplicando migraciones:', error);
      process.exit(1);
    });
}
