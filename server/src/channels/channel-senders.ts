import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/domain-error';
import { loadEnv } from '../config/env';
import { ChannelName } from './channel-adapter';
import { ChannelCredentialsService } from './credentials/channel-credentials.service';

/** Contenido saliente ya validado; `body` siempre es el texto legible final. */
export interface OutboundContent {
  kind: 'text' | 'template';
  body: string;
  template?: { name: string; language: string; variables: string[] };
}

/**
 * Envío saliente por canal (outbound-messaging spec), simétrico a
 * MediaDownloader. `recipient` es el id externo de la channel identity de la
 * persona (wa_id / chat_id). Las credenciales se resuelven del almacén cifrado
 * (channel-credentials); sin credencial activa → isConfigured() false y el
 * endpoint responde CHANNEL_NOT_CONFIGURED antes de persistir nada.
 */
export interface ChannelSender {
  readonly channel: ChannelName;
  /** `accountId` = cuenta de la conversación (multi-account-routing); null → fallback. */
  isConfigured(accountId?: string | null): Promise<boolean>;
  send(
    recipient: string,
    content: OutboundContent,
    accountId?: string | null,
  ): Promise<{ externalMessageId: string }>;
}

function sendFailed(channel: string, detail: string): DomainError {
  return new DomainError('SEND_FAILED', `Envío por ${channel} falló: ${detail}`);
}

function notConfigured(channel: string): DomainError {
  return new DomainError(
    'CHANNEL_NOT_CONFIGURED',
    `Faltan credenciales activas para enviar por ${channel}`,
    409,
  );
}

/** WhatsApp Cloud API: POST {base}/{phoneNumberId}/messages (texto o template). */
@Injectable()
export class WhatsAppSender implements ChannelSender {
  readonly channel = 'whatsapp' as const;

  constructor(private readonly credentials: ChannelCredentialsService) {}

  async isConfigured(accountId?: string | null): Promise<boolean> {
    return (await this.credentials.whatsapp(accountId)) !== null;
  }

  async send(
    recipient: string,
    content: OutboundContent,
    accountId?: string | null,
  ): Promise<{ externalMessageId: string }> {
    const env = loadEnv();
    const creds = await this.credentials.whatsapp(accountId);
    if (!creds) throw notConfigured('whatsapp');
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
      `${env.GRAPH_API_BASE_URL}/${creds.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
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

  constructor(private readonly credentials: ChannelCredentialsService) {}

  async isConfigured(accountId?: string | null): Promise<boolean> {
    return (await this.credentials.telegram(accountId)) !== null;
  }

  async send(
    recipient: string,
    content: OutboundContent,
    accountId?: string | null,
  ): Promise<{ externalMessageId: string }> {
    const env = loadEnv();
    const creds = await this.credentials.telegram(accountId);
    if (!creds) throw notConfigured('telegram');
    const response = await fetch(
      `${env.TELEGRAM_API_BASE_URL}/bot${creds.bot_token}/sendMessage`,
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

  constructor(protected readonly credentials: ChannelCredentialsService) {}

  async isConfigured(accountId?: string | null): Promise<boolean> {
    return (await this.credentials.metaPage(accountId)) !== null;
  }

  async send(
    recipient: string,
    content: OutboundContent,
    accountId?: string | null,
  ): Promise<{ externalMessageId: string }> {
    const env = loadEnv();
    const creds = await this.credentials.metaPage(accountId);
    if (!creds) throw notConfigured(this.channel);
    const response = await fetch(
      `${env.GRAPH_API_BASE_URL}/${creds.page_id}/messages?access_token=${creds.page_access_token}`,
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
  constructor(credentials: ChannelCredentialsService) {
    super(credentials);
  }
}

@Injectable()
export class InstagramSender extends MetaSendApiSender {
  readonly channel = 'instagram' as const;
  constructor(credentials: ChannelCredentialsService) {
    super(credentials);
  }
}
