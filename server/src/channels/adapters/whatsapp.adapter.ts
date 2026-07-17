import { Injectable } from '@nestjs/common';
import {
  ChannelAdapter,
  InboundMediaRef,
  InboundReferral,
  MessageKind,
  NormalizedInboundMessage,
} from '../channel-adapter';

interface WhatsAppContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface WhatsAppMediaObject {
  id?: string;
  mime_type?: string;
  filename?: string;
  caption?: string;
}

interface WhatsAppMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  audio?: WhatsAppMediaObject;
  voice?: WhatsAppMediaObject;
  image?: WhatsAppMediaObject;
  document?: WhatsAppMediaObject;
  video?: WhatsAppMediaObject;
  /** Presente cuando el usuario llegó por un anuncio Click-to-WhatsApp. */
  referral?: {
    source_id?: string;
    source_url?: string;
    source_type?: string;
    ctwa_clid?: string;
  };
}

interface WhatsAppStatus {
  id?: string;
  status?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

interface WhatsAppChangeValue {
  messaging_product?: string;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{ field?: string; value?: WhatsAppChangeValue }>;
  }>;
}

export interface ParsedDeliveryStatus {
  externalMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
}

const DELIVERY_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

/** type de la Cloud API → kind normalizado (voice cuenta como audio). */
const MEDIA_KINDS: Record<string, MessageKind> = {
  audio: 'audio',
  voice: 'audio',
  image: 'image',
  document: 'document',
  video: 'video',
};

/**
 * Normaliza payloads de WhatsApp Cloud API (object: whatsapp_business_account).
 * Texto y media (audio/voz/imagen/documento/video); stickers, reacciones,
 * ubicaciones y statuses producen lista vacía. Nunca descarga binarios.
 */
@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;

  parse(raw: unknown): NormalizedInboundMessage[] {
    const payload = raw as MetaWebhookPayload;
    if (payload?.object !== 'whatsapp_business_account') return [];

    const result: NormalizedInboundMessage[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const contactsByWaId = new Map<string, WhatsAppContact>(
          (value?.contacts ?? [])
            .filter((c): c is WhatsAppContact & { wa_id: string } => Boolean(c.wa_id))
            .map((c) => [c.wa_id, c]),
        );

        for (const message of value?.messages ?? []) {
          const normalized = this.parseMessage(message, contactsByWaId);
          if (normalized) result.push(normalized);
        }
      }
    }
    return result;
  }

  /**
   * Statuses de entrega de mensajes salientes (delivery-status spec):
   * sent/delivered/read/failed por wamid. Estados desconocidos se descartan.
   */
  parseStatuses(raw: unknown): ParsedDeliveryStatus[] {
    const payload = raw as MetaWebhookPayload;
    if (payload?.object !== 'whatsapp_business_account') return [];

    const result: ParsedDeliveryStatus[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        for (const status of change.value?.statuses ?? []) {
          if (!status.id || !status.status || !DELIVERY_STATUSES.has(status.status)) continue;
          const firstError = status.errors?.[0];
          result.push({
            externalMessageId: status.id,
            status: status.status as ParsedDeliveryStatus['status'],
            error: firstError
              ? `${firstError.code ?? ''} ${firstError.title ?? firstError.message ?? ''}`.trim()
              : undefined,
          });
        }
      }
    }
    return result;
  }

  private parseMessage(
    message: WhatsAppMessage,
    contactsByWaId: Map<string, WhatsAppContact>,
  ): NormalizedInboundMessage | null {
    if (!message.id || !message.from || !message.type) return null;

    let kind: MessageKind;
    let body: string | undefined;
    let media: InboundMediaRef | undefined;

    if (message.type === 'text' && message.text?.body) {
      kind = 'text';
      body = message.text.body;
    } else {
      const mediaKind = MEDIA_KINDS[message.type];
      const mediaObject = (message as Record<string, unknown>)[message.type] as
        | WhatsAppMediaObject
        | undefined;
      if (!mediaKind || !mediaObject?.id) return null;
      kind = mediaKind;
      body = mediaObject.caption;
      media = {
        externalId: mediaObject.id,
        mimeType: mediaObject.mime_type,
        filename: mediaObject.filename,
      };
    }

    const contact = contactsByWaId.get(message.from);
    let referral: InboundReferral | undefined;
    if (message.referral?.source_id) {
      referral = {
        sourceId: message.referral.source_id,
        sourceUrl: message.referral.source_url,
        sourceType: message.referral.source_type,
        ctwaClid: message.referral.ctwa_clid,
      };
    }

    return {
      channel: this.channel,
      kind,
      media,
      referral,
      externalMessageId: message.id,
      externalUserId: message.from,
      senderName: contact?.profile?.name,
      // wa_id son dígitos con código de país sin '+' → E.164 directo.
      phoneE164: `+${message.from}`,
      body,
      sentAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
      raw: message as Record<string, unknown>,
    };
  }
}
