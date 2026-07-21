import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { loadEnv } from './config/env';
import { DomainErrorFilter } from './common/domain-error.filter';

/**
 * Configuración común de la app HTTP, compartida entre main.ts y los tests
 * e2e para que ambos ejecuten exactamente el mismo pipeline: prefijo /api
 * (health y webhooks quedan fuera), CORS por env, errores de dominio y
 * adaptador WebSocket nativo (ws).
 */
export function configureApp(app: INestApplication): void {
  const env = loadEnv();

  app.setGlobalPrefix('api', {
    exclude: ['health', 'webhooks/meta', 'webhooks/telegram/:accountId', 'bot/v1/actions'],
  });
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
  });
  app.useGlobalFilters(new DomainErrorFilter());
  app.useWebSocketAdapter(new WsAdapter(app));
}
