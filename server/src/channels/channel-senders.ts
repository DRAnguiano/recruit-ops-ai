import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/domain-error';
import { loadEnv } from '../config/env';
import { ChannelName } from './channel-adapter';

/** Contenido saliente ya validado; `body` siempre es el texto legible final. */
export interface OutboundContent {
  kind: 'text' | 'template';
  body: string;
  template?: { name: string; language: string; variables: string[] };
}

/**
 * Envío saliente por canal (outbound-messaging spec), simétrico a
 * MediaDownloader. `recipient` es el id externo de la channel identity de la
 * persona (wa_id / chat_id). Sin credenciales → isConfigured() false y el
 * endpoint responde CHANNEL_NOT_CONFIGURED antes de persistir nada.
 */
export interface ChannelSender {
  readonly channel: ChannelName;
  isConfigured(): boolean;
  send(recipient: string, content: OutboundContent): Promise<{ externalMessageId: string }>;
}

function sendFailed(channel: string, detail: string): DomainError {
  return new DomainError('SEND_FAILED', `Envío por ${channel} falló: ${detail}`);
}

/** WhatsApp Cloud API: POST {base}/{phoneNumberId}/messages (texto o template). */
@Injectable()
export class WhatsAppSender implements ChannelSender {
  readonly channel = 'whatsapp' as const;

  isConfigured(): boolean {
    const env = loadEnv();
    return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  }

  async send(
    recipient: string,
    content: OutboundContent,
  ): Promise<{ externalMessageId: string }> {
    const env = loadEnv();
    const to = recipient.replace(/^\+/, '');

    const payload =
      content.kind === 'template' && content.template
        ? {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: content.template.name,
              language: { code: content.template.language },
              ...(content.template.variables.length > 0
                ? {
                    components: [
                      {
                        type: 'body',
                        parameters: content.template.variables.map((text) => ({
                          type: 'text',
                          text,
                        })),
                      },
                    ],
                  }
                : {}),
            },
          }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: content.body } };

    const response = await fetch(
      `${env.GRAPH_API_BASE_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      throw sendFailed('whatsapp', `HTTP ${response.status} ${await response.text()}`.slice(0, 500));
    }
    const data = (await response.json()) as { messages?: { id?: string }[] };
    const wamid = data.messages?.[0]?.id;
    if (!wamid) throw sendFailed('whatsapp', 'respuesta de Cloud API sin wamid');
    return { externalMessageId: wamid };
  }
}

/** Telegram Bot API: sendMessage con el chat_id de la identidad. */
@Injectable()
export class TelegramSender implements ChannelSender {
  readonly channel = 'telegram' as const;

  isConfigured(): boolean {
    return Boolean(loadEnv().TELEGRAM_BOT_TOKEN);
  }

  async send(
    recipient: string,
    content: OutboundContent,
  ): Promise<{ externalMessageId: string }> {
    const env = loadEnv();
    const response = await fetch(
      `${env.TELEGRAM_API_BASE_URL}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: recipient, text: content.body }),
      },
    );
    if (!response.ok) {
      throw sendFailed('telegram', `HTTP ${response.status} ${await response.text()}`.slice(0, 500));
    }
    const data = (await response.json()) as { ok?: boolean; result?: { message_id?: number } };
    if (!data.ok || data.result?.message_id === undefined) {
      throw sendFailed('telegram', 'respuesta de sendMessage sin message_id');
    }
    // Mismo formato que el adapter entrante: `${chatId}_${messageId}` único por canal.
    return { externalMessageId: `${recipient}_${data.result.message_id}` };
  }
}

/**
 * Send API de Messenger/Instagram: POST {base}/{META_PAGE_ID}/messages con el
 * token de página (la cuenta IG profesional va conectada a la página, mismo
 * endpoint y credenciales para ambos canales). Solo texto: estos canales no
 * tienen plantillas aprobadas tipo WhatsApp.
 */
abstract class MetaSendApiSender implements ChannelSender {
  abstract readonly channel: ChannelName;

  isConfigured(): boolean {
    const env = loadEnv();
    return Boolean(env.META_PAGE_ID && env.META_PAGE_ACCESS_TOKEN);
  }

  async send(
    recipient: string,
    content: OutboundContent,
  ): Promise<{ externalMessageId: string }> {
    const env = loadEnv();
    const response = await fetch(
      `${env.GRAPH_API_BASE_URL}/${env.META_PAGE_ID}/messages?access_token=${env.META_PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipient },
          messaging_type: 'RESPONSE',
          message: { text: content.body },
        }),
      },
    );
    if (!response.ok) {
      throw sendFailed(
        this.channel,
        `HTTP ${response.status} ${await response.text()}`.slice(0, 500),
      );
    }
    const data = (await response.json()) as { message_id?: string };
    if (!data.message_id) {
      throw sendFailed(this.channel, 'respuesta de Send API sin message_id');
    }
    return { externalMessageId: data.message_id };
  }
}

@Injectable()
export class MessengerSender extends MetaSendApiSender {
  readonly channel = 'messenger' as const;
}

@Injectable()
export class InstagramSender extends MetaSendApiSender {
  readonly channel = 'instagram' as const;
}
