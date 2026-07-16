import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../../database/database.module';
import { messages, MessageMedia } from '../../database/schema';
import { DomainEventsService } from '../../events/domain-events.service';
import { MediaDownloader, TelegramMediaDownloader, WhatsAppMediaDownloader } from './media-downloaders';
import { MEDIA_STORAGE, MediaStorage } from './media-storage';

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
};

/**
 * Procesa un job de `channels.media`: resuelve y descarga el binario del
 * canal, lo guarda vía MediaStorage y actualiza `messages.media`
 * (pending → stored | failed). Sin token del canal, la media queda pending.
 */
@Injectable()
export class MediaDownloadService {
  private readonly logger = new Logger(MediaDownloadService.name);
  private readonly downloaders: Map<string, MediaDownloader>;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly events: DomainEventsService,
    whatsapp: WhatsAppMediaDownloader,
    telegram: TelegramMediaDownloader,
  ) {
    this.downloaders = new Map<string, MediaDownloader>([
      [whatsapp.channel, whatsapp],
      [telegram.channel, telegram],
    ]);
  }

  /** true = resuelto (stored o sin token); lanzar = BullMQ reintenta. */
  async process(messageId: string): Promise<void> {
    const message = await this.db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
    const media = message?.media;
    if (!message || !media || media.status !== 'pending') return;

    const downloader = this.downloaders.get(message.channel);
    if (!downloader) return;

    const downloaded = await downloader.download(media.externalId);
    if (!downloaded) {
      // Canal sin token: degradación consciente, la media sigue pending.
      this.logger.warn(`Sin token para media de ${message.channel}; mensaje ${messageId} queda pending`);
      return;
    }

    const mimeType = media.mimeType ?? downloaded.mimeType;
    const filename =
      media.filename ?? `${media.externalId}${EXTENSION_BY_MIME[mimeType ?? ''] ?? '.bin'}`;
    const storageKey = `${message.channel}/${messageId}/${filename}`;
    const { sizeBytes } = await this.storage.save(storageKey, downloaded.data);

    const updated: MessageMedia = {
      ...media,
      mimeType,
      filename,
      status: 'stored',
      storageKey,
      sizeBytes,
    };
    await this.db.update(messages).set({ media: updated }).where(eq(messages.id, messageId));

    await this.events.append({
      type: 'message.media_stored',
      aggregateType: 'message',
      aggregateId: messageId,
      actor: 'system',
      payload: { channel: message.channel, storageKey, sizeBytes, mimeType },
    });
  }

  async markFailed(messageId: string, error: string): Promise<void> {
    const message = await this.db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
    const media = message?.media;
    if (!message || !media || media.status !== 'pending') return;
    await this.db
      .update(messages)
      .set({ media: { ...media, status: 'failed', error } })
      .where(eq(messages.id, messageId));
  }
}
