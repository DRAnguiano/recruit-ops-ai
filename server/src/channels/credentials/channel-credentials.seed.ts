import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DB, Database } from '../../database/database.module';
import { channelCredentials } from '../../database/schema';
import { CredentialKind } from './channel-credentials.service';
import { ChannelCredentialsService } from './channel-credentials.service';
import { CREDENTIAL_CIPHER } from './channel-credentials.service';
import { CredentialCipher } from './credential-cipher';

/**
 * Mapa de migración: nombres de env legacy → campos de secreto por `kind`. Se
 * leen directamente de `process.env` (ya no están en el esquema zod); es la
 * ruta de una sola vez para despliegues que aún tengan las variables viejas.
 */
const LEGACY_ENV: Record<CredentialKind, { label: string; fields: Record<string, string> }> = {
  meta_app: {
    label: 'Meta app (migrado de env)',
    fields: { app_secret: 'META_APP_SECRET', verify_token: 'META_VERIFY_TOKEN' },
  },
  whatsapp: {
    label: 'WhatsApp (migrado de env)',
    fields: { access_token: 'WHATSAPP_ACCESS_TOKEN', phone_number_id: 'WHATSAPP_PHONE_NUMBER_ID' },
  },
  meta_page: {
    label: 'Página Meta (migrado de env)',
    fields: { page_id: 'META_PAGE_ID', page_access_token: 'META_PAGE_ACCESS_TOKEN' },
  },
  telegram: {
    label: 'Telegram (migrado de env)',
    fields: { bot_token: 'TELEGRAM_BOT_TOKEN', webhook_secret: 'TELEGRAM_WEBHOOK_SECRET' },
  },
};

/**
 * Migración idempotente env → almacén cifrado (channel-credentials): al
 * arrancar, si hay llave maestra y NO existe fila de un `kind`, crea la
 * credencial desde las env legacy completas. Nunca pisa filas existentes; sin
 * llave o sin env completas, no hace nada.
 */
@Injectable()
export class ChannelCredentialsSeed implements OnModuleInit {
  private readonly logger = new Logger(ChannelCredentialsSeed.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CREDENTIAL_CIPHER) private readonly cipher: CredentialCipher | null,
    private readonly credentials: ChannelCredentialsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.cipher) return;

    const existing = await this.db.select().from(channelCredentials);
    const kindsPresent = new Set(existing.map((r) => r.kind));

    for (const kind of Object.keys(LEGACY_ENV) as CredentialKind[]) {
      if (kindsPresent.has(kind)) continue;

      const { label, fields } = LEGACY_ENV[kind];
      const secrets: Record<string, string> = {};
      let complete = true;
      for (const [secretKey, envName] of Object.entries(fields)) {
        const value = process.env[envName];
        if (!value) {
          complete = false;
          break;
        }
        secrets[secretKey] = value;
      }
      if (!complete) continue;

      await this.credentials.create(kind, label, secrets);
      this.logger.log(`Credencial ${kind} migrada de env al almacén cifrado`);
    }

    // Backfill de account_external_id para credenciales creadas por 10c
    // (multi-account-routing); idempotente, solo toca filas con la columna NULL.
    await this.credentials.backfillAccountIds();
  }
}
