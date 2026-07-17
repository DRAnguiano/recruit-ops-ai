import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url({ message: 'debe ser una URL postgres://' }),
  REDIS_URL: z.string().url({ message: 'debe ser una URL redis://' }),
  // Canales (opcionales): su ausencia no impide arrancar, solo deshabilita
  // el webhook correspondiente (responde 403 hasta configurarse).
  META_APP_SECRET: z.string().min(1).optional(),
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Media: tokens para descargar binarios (sin ellos la media queda `pending`).
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  // Envío saliente WhatsApp: id del número en la Cloud API. Sin él, enviar
  // por WhatsApp responde CHANNEL_NOT_CONFIGURED (409).
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  // Messenger/Instagram (Send API): página de Facebook con la cuenta IG
  // conectada. Sin ellos, esos canales ingieren pero no pueden enviar.
  META_PAGE_ID: z.string().min(1).optional(),
  META_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  MEDIA_STORAGE_DIR: z.string().min(1).default('./storage/media'),
  // Bot gateway (FastAPI externo): sin estos dos, el gateway queda
  // deshabilitado — no se notifica al bot y /bot/v1/actions responde 403.
  BOT_WEBHOOK_URL: z.string().url().optional(),
  BOT_SHARED_SECRET: z.string().min(16).optional(),
  // Base pública del backend para URLs absolutas hacia servicios externos
  // (ej. mediaUrl del bot). Default: localhost con el puerto local.
  PUBLIC_BASE_URL: z.string().url().optional(),
  // Marketing API (read-only, permiso ads_read): sin token/cuenta el sync de
  // campañas queda deshabilitado con log — nunca datos inventados.
  META_ADS_ACCESS_TOKEN: z.string().min(1).optional(),
  META_AD_ACCOUNT_ID: z.string().min(1).optional(),
  // Bases de API con defaults oficiales; configurables para tests/proxies.
  GRAPH_API_BASE_URL: z.string().url().default('https://graph.facebook.com/v20.0'),
  TELEGRAM_API_BASE_URL: z.string().url().default('https://api.telegram.org'),
  MARKETING_API_BASE_URL: z.string().url().default('https://graph.facebook.com/v20.0'),
  // Orígenes permitidos para CORS (separados por coma); default: el dev
  // server de la SPA (:5173 — el 3000 lo ocupa Chatwoot en esta máquina).
  CORS_ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Valida las variables de entorno antes de crear la app.
 * Si algo falta o es inválido, el proceso termina con un mensaje legible:
 * el backend nunca arranca con configuración inválida.
 */
export function loadEnv(): Env {
  if (cached) return cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    console.error(
      `Configuración de entorno inválida (ver .env.example):\n${lines.join('\n')}`,
    );
    process.exit(1);
  }

  cached = result.data;
  return cached;
}

/** Solo para tests: fuerza a re-validar process.env en la próxima llamada. */
export function resetEnvCache(): void {
  cached = null;
}
