import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadDotenv } from './config/load-dotenv';
import { loadEnv } from './config/env';
import { DomainErrorFilter } from './common/domain-error.filter';

async function bootstrap(): Promise<void> {
  loadDotenv();
  const env = loadEnv();

  // rawBody: la firma X-Hub-Signature-256 de Meta es HMAC del cuerpo crudo
  // exacto; sin el buffer original la verificación es imposible.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  console.log(`Backend escuchando en http://localhost:${env.PORT}`);
}

void bootstrap();
