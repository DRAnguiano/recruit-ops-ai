import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DB, Database } from '../../database/database.module';
import { DomainError, notFound } from '../../common/domain-error';
import { DomainEventsService } from '../../events/domain-events.service';
import { channelCredentials, conversations } from '../../database/schema';
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
  accountExternalId: string | null;
  label: string;
  active: boolean;
  configured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Campo de secreto que identifica la cuenta por kind (null para meta_app). */
const ACCOUNT_SECRET_FIELD: Record<CredentialKind, string | null> = {
  meta_app: null,
  whatsapp: 'phone_number_id',
  meta_page: 'page_id',
  telegram: 'bot_token',
};

/**
 * `conversations.channel` que puede referenciar la cuenta de cada kind
 * (meta_page cubre Messenger e Instagram; meta_app no es una cuenta, sin
 * canal). No es una FK real (`channel_account` es texto libre), así que el
 * borrado referenciado se valida a mano, igual que en catalog-entries.
 */
const CHANNELS_BY_KIND: Record<CredentialKind, string[]> = {
  meta_app: [],
  whatsapp: ['whatsapp'],
  meta_page: ['messenger', 'instagram'],
  telegram: ['telegram'],
};

/** Deriva el `account_external_id` de los secretos (telegram: id antes de `:`). */
function accountFromSecrets(kind: CredentialKind, secrets: Record<string, string>): string | null {
  const field = ACCOUNT_SECRET_FIELD[kind];
  if (!field) return null;
  const value = secrets[field];
  if (!value) return null;
  return kind === 'telegram' ? (value.split(':')[0] ?? value) : value;
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
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CREDENTIAL_CIPHER) private readonly cipher: CredentialCipher | null,
    private readonly events: DomainEventsService,
  ) {}

  // ── Resolución (lado lectura) ───────────────────────────────────────────

  /**
   * Secretos descifrados de la credencial activa de `kind` para `accountId`, o
   * null. Sin `accountId` (conversaciones previas al ruteo multi-cuenta) usa la
   * ÚNICA activa del kind; si hay varias es ambiguo → null. Nunca lanza.
   */
  async resolveByAccount(
    kind: CredentialKind,
    accountId?: string | null,
  ): Promise<Record<string, string> | null> {
    const key = `${kind}:${accountId ?? ''}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.secrets;

    const secrets = await this.load(kind, accountId);
    this.cache.set(key, { secrets, expiresAt: Date.now() + CACHE_TTL_MS });
    return secrets;
  }

  async metaApp(): Promise<MetaAppSecrets | null> {
    return (await this.resolveByAccount('meta_app')) as MetaAppSecrets | null;
  }
  async whatsapp(accountId?: string | null): Promise<WhatsAppSecrets | null> {
    return (await this.resolveByAccount('whatsapp', accountId)) as WhatsAppSecrets | null;
  }
  async metaPage(accountId?: string | null): Promise<MetaPageSecrets | null> {
    return (await this.resolveByAccount('meta_page', accountId)) as MetaPageSecrets | null;
  }
  async telegram(accountId?: string | null): Promise<TelegramSecrets | null> {
    return (await this.resolveByAccount('telegram', accountId)) as TelegramSecrets | null;
  }

  private async load(
    kind: CredentialKind,
    accountId?: string | null,
  ): Promise<Record<string, string> | null> {
    if (!this.cipher) return null;

    let row: typeof channelCredentials.$inferSelect | undefined;
    if (accountId) {
      row = await this.db.query.channelCredentials.findFirst({
        where: and(
          eq(channelCredentials.kind, kind),
          eq(channelCredentials.active, true),
          eq(channelCredentials.accountExternalId, accountId),
        ),
      });
    } else {
      // Sin cuenta: solo resuelve si hay exactamente una activa del kind.
      const rows = await this.db.query.channelCredentials.findMany({
        where: and(eq(channelCredentials.kind, kind), eq(channelCredentials.active, true)),
      });
      if (rows.length !== 1) return null;
      row = rows[0];
    }
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
    const accountExternalId = accountFromSecrets(kind, secrets);
    let row: typeof channelCredentials.$inferSelect | undefined;
    try {
      [row] = await this.db
        .insert(channelCredentials)
        .values({ kind, accountExternalId, label, secretsEncrypted })
        .returning();
    } catch (error) {
      throw this.translateWrite(error, kind);
    }
    if (!row) throw new Error('Insert into channel_credentials returned no row');
    this.invalidate();
    await this.audit('channel_credential.created', row.id, { kind, accountExternalId, label });
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
      const kind = existing.kind as CredentialKind;
      this.assertSecretFields(kind, patch.secrets);
      set.secretsEncrypted = this.encryptOrThrow(patch.secrets);
      set.accountExternalId = accountFromSecrets(kind, patch.secrets);
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
    const existing = await this.db.query.channelCredentials.findFirst({
      where: eq(channelCredentials.id, id),
    });
    if (!existing) throw notFound('CHANNEL_CREDENTIAL_NOT_FOUND', `No existe credencial ${id}`);

    // `channel_account` no es una FK real: se valida a mano si hay conversaciones
    // de esta cuenta antes de borrar (multi-account-routing).
    const kind = existing.kind as CredentialKind;
    const channels = CHANNELS_BY_KIND[kind];
    if (existing.accountExternalId && channels.length > 0) {
      const referencing = await this.db.query.conversations.findFirst({
        where: and(
          inArray(conversations.channel, channels),
          eq(conversations.channelAccount, existing.accountExternalId),
        ),
      });
      if (referencing) {
        throw new DomainError(
          'RESOURCE_REFERENCED',
          'No se puede borrar: hay conversaciones que usan esta credencial',
          409,
        );
      }
    }

    const rows = await this.db
      .delete(channelCredentials)
      .where(eq(channelCredentials.id, id))
      .returning();
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
      accountExternalId: row.accountExternalId,
      label: row.label,
      active: row.active,
      configured,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Backfill idempotente (multi-account-routing): rellena `account_external_id`
   * de las filas creadas por 10c (que no lo tenían) descifrando sus secretos.
   * Solo toca filas con la columna en NULL; con llave incorrecta se salta.
   */
  async backfillAccountIds(): Promise<void> {
    if (!this.cipher) return;
    const rows = await this.db.query.channelCredentials.findMany({
      where: isNull(channelCredentials.accountExternalId),
    });
    for (const row of rows) {
      const kind = row.kind as CredentialKind;
      if (ACCOUNT_SECRET_FIELD[kind] === null) continue; // meta_app: sin cuenta
      let account: string | null;
      try {
        account = accountFromSecrets(kind, this.cipher.decrypt(row.secretsEncrypted));
      } catch {
        continue;
      }
      if (!account) continue;
      await this.db
        .update(channelCredentials)
        .set({ accountExternalId: account, updatedAt: new Date() })
        .where(eq(channelCredentials.id, row.id));
    }
    this.invalidate();
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
