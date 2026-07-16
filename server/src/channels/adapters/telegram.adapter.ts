import { Injectable } from '@nestjs/common';
import {
  ChannelAdapter,
  InboundMediaRef,
  MessageKind,
  NormalizedInboundMessage,
} from '../channel-adapter';

interface TelegramFileLike {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    caption?: string;
    from?: { id?: number; first_name?: string; last_name?: string };
    chat?: { id?: number };
    contact?: { phone_number?: string; user_id?: number };
    voice?: TelegramFileLike;
    audio?: TelegramFileLike;
    photo?: TelegramFileLike[];
    document?: TelegramFileLike;
    video?: TelegramFileLike;
  };
}

/**
 * Normaliza updates del Bot API de Telegram: texto, contacto propio y media
 * (voz/audio/foto/documento/video). Para fotos toma la mayor resolución
 * (último elemento del array `photo`). Stickers y demás → lista vacía.
 * Telegram no expone teléfono salvo contacto compartido.
 */
@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly channel = 'telegram' as const;

  parse(raw: unknown): NormalizedInboundMessage[] {
    const update = raw as TelegramUpdate;
    const message = update?.message;
    if (!message?.message_id || !message.chat?.id) return [];

    let kind: MessageKind = 'text';
    let media: InboundMediaRef | undefined;

    const mediaSource: Array<[MessageKind, TelegramFileLike | undefined]> = [
      ['audio', message.voice],
      ['audio', message.audio],
      ['image', message.photo?.[message.photo.length - 1]],
      ['document', message.document],
      ['video', message.video],
    ];
    for (const [mediaKind, file] of mediaSource) {
      if (file?.file_id) {
        kind = mediaKind;
        media = {
          externalId: file.file_id,
          mimeType: file.mime_type,
          filename: file.file_name,
        };
        break;
      }
    }

    const isOwnContact =
      message.contact?.phone_number !== undefined &&
      message.contact.user_id === message.from?.id;

    const body = message.text ?? message.caption;
    if (kind === 'text' && !body && !isOwnContact) return [];

    const chatId = message.chat.id;
    const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ');

    let phoneE164: string | undefined;
    if (isOwnContact && message.contact?.phone_number) {
      const digits = message.contact.phone_number.replace(/\D/g, '');
      phoneE164 = `+${digits}`;
    }

    return [
      {
        channel: this.channel,
        kind,
        media,
        externalMessageId: `${chatId}_${message.message_id}`,
        externalUserId: String(chatId),
        senderName: name || undefined,
        phoneE164,
        body,
        sentAt: message.date ? new Date(message.date * 1000) : new Date(),
        raw: message as Record<string, unknown>,
      },
    ];
  }
}
