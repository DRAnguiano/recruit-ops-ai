import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/domain-error';
import { loadEnv } from '../../config/env';
import { ChannelName } from '../channel-adapter';
import { ChannelCredentialsService } from '../credentials/channel-credentials.service';

export interface DownloadedMedia {
  data: Buffer;
  mimeType?: string;
  /** Nombre de archivo sugerido cuando el externalId no sirve como tal (URLs). */
  filename?: string;
}

/**
 * Descarga el binario de un media id según el canal. `null` cuando el canal
 * no tiene token configurado (la media queda `pending`, sin error).
 */
export interface MediaDownloader {
  readonly channel: ChannelName;
  /** null = canal sin token configurado (degradación, no error). */
  download(externalId: string): Promise<DownloadedMedia | null>;
}

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

async function fetchBuffer(
  url: string,
  headers?: Record<string, string>,
): Promise<{ data: Buffer; contentType?: string }> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new DomainError('MEDIA_DOWNLOAD_FAILED', `HTTP ${response.status} al descargar media`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > MAX_MEDIA_BYTES) {
    throw new DomainError('MEDIA_TOO_LARGE', `Media de ${data.byteLength} bytes excede el límite`);
  }
  return { data, contentType: response.headers.get('content-type') ?? undefined };
}

/**
 * WhatsApp Cloud API: GET {base}/{mediaId} devuelve una URL efímera (~5 min)
 * que se descarga con el mismo Bearer. Nunca persistimos la URL, solo el id.
 */
@Injectable()
export class WhatsAppMediaDownloader implements MediaDownloader {
  readonly channel = 'whatsapp' as const;

  constructor(private readonly credentials: ChannelCredentialsService) {}

  async download(externalId: string): Promise<DownloadedMedia | null> {
    const env = loadEnv();
    const token = (await this.credentials.whatsapp())?.access_token;
    if (!token) return null;

    const headers = { Authorization: `Bearer ${token}` };
    const metaResponse = await fetch(`${env.GRAPH_API_BASE_URL}/${externalId}`, { headers });
    if (!metaResponse.ok) {
      throw new DomainError(
        'MEDIA_RESOLVE_FAILED',
        `HTTP ${metaResponse.status} al resolver media ${externalId}`,
      );
    }
    const meta = (await metaResponse.json()) as { url?: string; mime_type?: string };
    if (!meta.url) {
      throw new DomainError('MEDIA_RESOLVE_FAILED', `Media ${externalId} sin URL en Graph API`);
    }
    const { data } = await fetchBuffer(meta.url, headers);
    return { data, mimeType: meta.mime_type };
  }
}

/** Telegram Bot API: getFile → file_path → GET {base}/file/bot{token}/{file_path}. */
@Injectable()
export class TelegramMediaDownloader implements MediaDownloader {
  readonly channel = 'telegram' as const;

  constructor(private readonly credentials: ChannelCredentialsService) {}

  async download(externalId: string): Promise<DownloadedMedia | null> {
    const env = loadEnv();
    const token = (await this.credentials.telegram())?.bot_token;
    if (!token) return null;

    const base = env.TELEGRAM_API_BASE_URL;
    const fileResponse = await fetch(
      `${base}/bot${token}/getFile?file_id=${encodeURIComponent(externalId)}`,
    );
    if (!fileResponse.ok) {
      throw new DomainError(
        'MEDIA_RESOLVE_FAILED',
        `HTTP ${fileResponse.status} en getFile de ${externalId}`,
      );
    }
    const payload = (await fileResponse.json()) as {
      ok?: boolean;
      result?: { file_path?: string };
    };
    const filePath = payload.result?.file_path;
    if (!payload.ok || !filePath) {
      throw new DomainError('MEDIA_RESOLVE_FAILED', `getFile sin file_path para ${externalId}`);
    }
    const { data } = await fetchBuffer(`${base}/file/bot${token}/${filePath}`);
    return { data };
  }
}

/**
 * Messenger/Instagram: el externalId ES la URL firmada del CDN (la
 * autorización viaja en la firma de la URL, sin token). Se descarga directo;
 * el filename se deriva del path del CDN porque la URL no sirve como nombre.
 * Si la firma expiró, el fetch falla y el job termina `failed` re-encolable.
 */
@Injectable()
export class MetaCdnMediaDownloader implements MediaDownloader {
  constructor(readonly channel: ChannelName) {}

  async download(externalId: string): Promise<DownloadedMedia | null> {
    const { data, contentType } = await fetchBuffer(externalId);
    let filename: string | undefined;
    try {
      const basename = new URL(externalId).pathname.split('/').pop() ?? '';
      filename = /^[\w][\w.-]*$/.test(basename) ? basename : undefined;
    } catch {
      filename = undefined;
    }
    return { data, mimeType: contentType, filename };
  }
}
