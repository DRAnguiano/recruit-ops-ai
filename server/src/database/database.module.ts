import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../config/env';
import * as schema from './schema';

export const DB = Symbol('DB');
export const SQL_CLIENT = Symbol('SQL_CLIENT');

export type Database = PostgresJsDatabase<typeof schema>;
export type SqlClient = ReturnType<typeof postgres>;

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly client: SqlClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

/**
 * Provider propio de Drizzle sobre postgres.js (ver design.md, decisión 2).
 * Global: todos los módulos de dominio inyectan `DB` sin re-importar infraestructura.
 */
@Global()
@Module({
  providers: [
    {
      provide: SQL_CLIENT,
      useFactory: (): SqlClient => postgres(loadEnv().DATABASE_URL),
    },
    {
      provide: DB,
      inject: [SQL_CLIENT],
      useFactory: (client: SqlClient): Database => drizzle(client, { schema }),
    },
    DatabaseLifecycle,
  ],
  exports: [DB, SQL_CLIENT],
})
export class DatabaseModule {}
