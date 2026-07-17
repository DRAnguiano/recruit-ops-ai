import { Injectable } from '@nestjs/common';
import {
  ChannelAdapter,
  ChannelName,
  InboundMediaRef,
  InboundReferral,
  MessageKind,
  NormalizedInboundMessage,
} from '../channel-adapter';

interface MetaAttachment {
  type?: string;
  payload?: { url?: string };
}

interface MetaReferral {
  ref?: string;
  ad_id?: string;
  source?: string;
  type?: string;
}

interface MetaMessagingEvent {
  sender?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: MetaAttachment[];
  };
  referral?: MetaReferral;
  postback?: { referral?: MetaReferral };
}

interface MetaMessagingPayload {
  object?: string;
  entry?: Array<{ messaging?: MetaMessagingEvent[] }>;
}

/** type de attachment de Messenger/IG → kind normalizado (`file` es documento). */
const ATTACHMENT_KINDS: Record<string, MessageKind> = {
  audio: 'audio',
  image: 'image',
  video: 'video',
  file: 'document',
};

/**
 * Parser compartido de `entry[].messaging[]` (Messenger e Instagram usan el
 * mismo shape; solo cambia `object`). Identidad por PSID/IGSID sin teléfono
 * ni nombre — el webhook no los trae y no se inventan. Los adjuntos llegan
 * como URL firmada de CDN: se guarda como externalId, nunca se descarga aquí.
 * Echoes y eventos sin `message` (delivery/read/postback) producen lista
 * vacía, igual que los statuses de WhatsApp.
 */
function parseMetaMessaging(
  raw: unknown,
  expectedObject: string,
  channel: ChannelName,
): NormalizedInboundMessage[] {
  const payload = raw as MetaMessagingPayload;
  if (payload?.object !== expectedObject) return [];

  const result: NormalizedInboundMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const message = event.message;
      const senderId = event.sender?.id;
      if (!message || message.is_echo || !message.mid || !senderId) continue;

      let kind: MessageKind = 'text';
      let media: InboundMediaRef | undefined;
      if (!message.text) {
        const attachment = (message.attachments ?? []).find(
          (a): a is MetaAttachment & { type: string; payload: { url: string } } =>
            Boolean(a.type && ATTACHMENT_KINDS[a.type] && a.payload?.url),
        );
        if (!attachment) continue; // stickers, shares, fallback: ACK sin persistir
        kind = ATTACHMENT_KINDS[attachment.type]!;
        media = { externalId: attachment.payload.url };
      }

      const referral = event.referral ?? event.postback?.referral;
      const sourceId = referral?.ad_id ?? referral?.ref;

      result.push({
        channel,
        kind,
        media,
        referral: sourceId
          ? { sourceId, sourceType: referral?.source ?? referral?.type }
          : undefined,
        externalMessageId: message.mid,
        externalUserId: senderId,
        body: message.text,
        sentAt: event.timestamp ? new Date(event.timestamp) : new Date(),
        raw: event as Record<string, unknown>,
      });
    }
  }
  return result;
}

/** Facebook Messenger: payloads del webhook de Meta con `object=page`. */
@Injectable()
export class MessengerAdapter implements ChannelAdapter {
  readonly channel = 'messenger' as const;

  parse(raw: unknown): NormalizedInboundMessage[] {
    return parseMetaMessaging(raw, 'page', this.channel);
  }
}

/** Instagram DM: payloads del webhook de Meta con `object=instagram`. */
@Injectable()
export class InstagramAdapter implements ChannelAdapter {
  readonly channel = 'instagram' as const;

  parse(raw: unknown): NormalizedInboundMessage[] {
    return parseMetaMessaging(raw, 'instagram', this.channel);
  }
}
