import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, Database } from '../../database/database.module';
import { DomainError, notFound } from '../../common/domain-error';
import { DomainEventsService } from '../../events/domain-events.service';
import { channelCredentials } from '../../database/schema';
import { CredentialCipher } from './credential-cipher';

/** Token DI del cipher; null cuando no hay llave maestra configurada. */
export const CREDENTIAL_CIPHER = Symbol('CREDENTIAL_CIPHER');

export type CredentialKind = 'meta_app' | 'whatsapp' | 'meta_page' | 'telegram';

/** Campos de secreto requeridos por cada tipo de credencial. */
export const KIND_SECRET_FIELDS: Record<CredentialKind, readonly string[]> = {
  meta_app: ['app_secret', 'verify_token'],
  whatsapp: ['access_token', 'phone_number_id'],
  meta_page: ['page_id', 'page_access_token'],
  telegram: ['bot_token', 'webhook_secret'],
};

export const CREDENTIAL_KINDS = Object.keys(KIND_SECRET_FIELDS) as CredentialKind[];

export interface MetaAppSecrets {
  app_secret: string;
  verify_token: string;
}
export interface WhatsAppSecrets {
  access_token: string;
  phone_number_id: string;
}
export interface MetaPageSecrets {
  page_id: string;
  page_access_token: string;
}
export interface TelegramSecrets {
  bot_token: string;
  webhook_secret: string;
}

export interface CredentialMetadata {
  id: string;
  kind: CredentialKind;
  label: string;
  active: boolean;
  configured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  secrets: Record<string, string> | null;
  expiresAt: number;
}

/**
 * Almacén cifrado de credenciales de canal (channel-credentials): resuelve la
 * credencial ACTIVA por tipo (descifrando bajo demanda, caché 60 s invalidada
 * al mutar) y expone el CRUD que acepta secretos al escribir pero nunca los
 * devuelve. Sin llave maestra o sin fila activa, la resolución es ausente y el
 * canal se comporta como no configurado — nunca lanza al resolver.
 */
@Injectable()
export class ChannelCredentialsService {
  private readonly logger = new Logger(ChannelCredentialsService.name);
  private readonly cache = new Map<CredentialKind, CacheEntry>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CREDENTIAL_CIPHER) private readonly cipher: CredentialCipher | null,
    private readonly events: DomainEventsService,
  ) {}

  // ── Resolución (lado lectura) ───────────────────────────────────────────

  /** Secretos descifrados de la credencial activa de `kind`, o null. Nunca lanza. */
  async resolve(kind: CredentialKind): Promise<Record<string, string> | null> {
    const cached = this.cache.get(kind);
    if (cached && cached.expiresAt > Date.now()) return cached.secrets;

    const secrets = await this.load(kind);
    this.cache.set(kind, { secrets, expiresAt: Date.now() + CACHE_TTL_MS });
    return secrets;
  }

  async metaApp(): Promise<MetaAppSecrets | null> {
    return (await this.resolve('meta_app')) as MetaAppSecrets | null;
  }
  async whatsapp(): Promise<WhatsAppSecrets | null> {
    return (await this.resolve('whatsapp')) as WhatsAppSecrets | null;
  }
  async metaPage(): Promise<MetaPageSecrets | null> {
    return (await this.resolve('meta_page')) as MetaPageSecrets | null;
  }
  async telegram(): Promise<TelegramSecrets | null> {
    return (await this.resolve('telegram')) as TelegramSecrets | null;
  }

  private async load(kind: CredentialKind): Promise<Record<string, string> | null> {
    if (!this.cipher) return null;
    const row = await this.db.query.channelCredentials.findFirst({
      where: and(eq(channelCredentials.kind, kind), eq(channelCredentials.active, true)),
    });
    if (!row) return null;
    try {
      return this.cipher.decrypt(row.secretsEncrypted);
    } catch (error) {
      // Llave incorrecta o blob manipulado: tratar como no configurado.
      this.logger.error(`No se pudo descifrar la credencial ${kind}: ${String(error)}`);
      return null;
    }
  }

  private invalidate(): void {
    this.cache.clear();
  }

  // ── CRUD (lado escritura; nunca devuelve secretos) ──────────────────────

  async list(): Promise<CredentialMetadata[]> {
    const rows = await this.db.select().from(channelCredentials);
    return rows.map((row) => this.toMetadata(row));
  }

  async create(
    kind: CredentialKind,
    label: string,
    secrets: Record<string, string>,
  ): Promise<CredentialMetadata> {
    const secretsEncrypted = this.encryptOrThrow(secrets);
    let row: typeof channelCredentials.$inferSelect | undefined;
    try {
      [row] = await this.db
        .insert(channelCredentials)
        .values({ kind, label, secretsEncrypted })
        .returning();
    } catch (error) {
      throw this.translateWrite(error, kind);
    }
    if (!row) throw new Error('Insert into channel_credentials returned no row');
    this.invalidate();
    await this.audit('channel_credential.created', row.id, { kind, label });
    return this.toMetadata(row);
  }

  async update(
    id: string,
    patch: { label?: string; active?: boolean; secrets?: Record<string, string> },
  ): Promise<CredentialMetadata> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.label !== undefined) set.label = patch.label;
    if (patch.active !== undefined) set.active = patch.active;
    if (patch.secrets !== undefined) {
      const existing = await this.db.query.channelCredentials.findFirst({
        where: eq(channelCredentials.id, id),
      });
      if (!existing) throw notFound('CHANNEL_CREDENTIAL_NOT_FOUND', `No existe credencial ${id}`);
      this.assertSecretFields(existing.kind as CredentialKind, patch.secrets);
      set.secretsEncrypted = this.encryptOrThrow(patch.secrets);
    }

    let row;
    try {
      [row] = await this.db
        .update(channelCredentials)
        .set(set)
        .where(eq(channelCredentials.id, id))
        .returning();
    } catch (error) {
      throw this.translateWrite(error, undefined);
    }
    if (!row) throw notFound('CHANNEL_CREDENTIAL_NOT_FOUND', `No existe credencial ${id}`);
    this.invalidate();
    await this.audit('channel_credential.updated', id, {
      label: patch.label,
      active: patch.active,
      rotated: patch.secrets !== undefined,
    });
    return this.toMetadata(row);
  }

  async remove(id: string): Promise<void> {
    let rows: unknown[];
    try {
      rows = await this.db
        .delete(channelCredentials)
        .where(eq(channelCredentials.id, id))
        .returning();
    } catch (error) {
      // El ruteo por cuenta (add-multi-account-routing) referenciará credenciales
      // desde conversaciones; entonces un borrado referenciado dará 23503 → 409.
      const cause = (error as { cause?: { code?: string } }).cause;
      if (cause?.code === '23503') {
        throw new DomainError(
          'RESOURCE_REFERENCED',
          'No se puede borrar: hay conversaciones que usan esta credencial',
          409,
        );
      }
      throw error;
    }
    if (rows.length === 0) {
      throw notFound('CHANNEL_CREDENTIAL_NOT_FOUND', `No existe credencial ${id}`);
    }
    this.invalidate();
    await this.audit('channel_credential.deleted', id, {});
  }

  // ── Internos ────────────────────────────────────────────────────────────

  private assertSecretFields(kind: CredentialKind, secrets: Record<string, string>): void {
    const expected = [...KIND_SECRET_FIELDS[kind]].sort();
    const got = Object.keys(secrets).sort();
    if (expected.length !== got.length || expected.some((f, i) => f !== got[i])) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Los secretos de una credencial ${kind} deben ser exactamente: ${expected.join(', ')}`,
        400,
      );
    }
  }

  private encryptOrThrow(secrets: Record<string, string>): string {
    if (!this.cipher) {
      throw new DomainError(
        'CHANNEL_CREDENTIALS_KEY_MISSING',
        'Falta CHANNEL_CREDENTIALS_KEY: no se pueden cifrar credenciales',
        409,
      );
    }
    return this.cipher.encrypt(secrets);
  }

  private translateWrite(error: unknown, kind: CredentialKind | undefined): unknown {
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === '23505') {
      return new DomainError(
        'DUPLICATE_RESOURCE',
        kind
          ? `Ya hay una credencial activa de tipo ${kind}; desactívala primero`
          : 'Ya hay una credencial activa de ese tipo; desactívala primero',
        409,
      );
    }
    return error;
  }

  private toMetadata(row: typeof channelCredentials.$inferSelect): CredentialMetadata {
    let configured = false;
    if (this.cipher) {
      try {
        this.cipher.decrypt(row.secretsEncrypted);
        configured = true;
      } catch {
        configured = false;
      }
    }
    return {
      id: row.id,
      kind: row.kind as CredentialKind,
      label: row.label,
      active: row.active,
      configured,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async audit(
    type: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.append({
      type,
      aggregateType: 'channel_credential',
      aggregateId,
      actor: 'user',
      payload,
    });
  }
}
