import { Controller, Get, Inject, Param, StreamableFile } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { DB, Database } from '../database/database.module';
import { messages } from '../database/schema';
import { notFound } from '../common/domain-error';
import { uuidParam } from '../common/uuid-param.pipe';
import { MEDIA_STORAGE, MediaStorage } from '../channels/media/media-storage';

/**
 * Sirve el binario almacenado de un mensaje de media. Solo media `stored`
 * es descargable; nunca se exponen rutas de filesystem ni storage keys crudos.
 */
@Controller('messages')
export class MessageMediaController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  @Get(':id/media')
  async download(@Param('id', uuidParam()) id: string): Promise<StreamableFile> {
    const message = await this.db.query.messages.findFirst({ where: eq(messages.id, id) });
    if (!message) throw notFound('MESSAGE_NOT_FOUND', `No existe el mensaje ${id}`);

    const media = message.media;
    if (!media || media.status !== 'stored' || !media.storageKey) {
      throw notFound('MEDIA_NOT_AVAILABLE', 'El mensaje no tiene media almacenada');
    }

    const path = this.storage.locate(media.storageKey);
    const info = await stat(path).catch(() => {
      throw notFound('MEDIA_NOT_AVAILABLE', 'El binario de media no está disponible');
    });

    return new StreamableFile(createReadStream(path), {
      type: media.mimeType ?? 'application/octet-stream',
      disposition: `inline; filename="${media.filename ?? 'media'}"`,
      length: info.size,
    });
  }
}
