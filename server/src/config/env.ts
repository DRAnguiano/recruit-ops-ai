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
  MEDIA_STORAGE_DIR: z.string().min(1).default('./storage/media'),
  // Bases de API con defaults oficiales; configurables para tests/proxies.
  GRAPH_API_BASE_URL: z.string().url().default('https://graph.facebook.com/v20.0'),
  TELEGRAM_API_BASE_URL: z.string().url().default('https://api.telegram.org'),
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
