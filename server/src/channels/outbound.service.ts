import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB, Database } from '../database/database.module';
import {
  channelIdentities,
  conversations,
  MessageDelivery,
  messages,
  messageTemplates,
} from '../database/schema';
import { DomainError, notFound } from '../common/domain-error';
import { DomainEventsService } from '../events/domain-events.service';
import { ChannelName } from './channel-adapter';
import {
  ChannelSender,
  InstagramSender,
  MessengerSender,
  OutboundContent,
  TelegramSender,
  WhatsAppSender,
} from './channel-senders';
import { getWindowState, WindowState } from './whatsapp-window';

export interface SendTextInput {
  kind: 'text';
  body: string;
}

export interface SendTemplateInput {
  kind: 'template';
  templateId: string;
  variables: string[];
}

export type SendInput = SendTextInput | SendTemplateInput;

/**
 * Canales de Meta con ventana de servicio de 24 h desde el último entrante.
 * WhatsApp tiene plantillas como salida fuera de ventana; Messenger/IG no.
 */
const WINDOWED_CHANNELS = new Set<string>(['whatsapp', 'messenger', 'instagram']);

/** Orden monotónico de estados de entrega: nunca se regresa. */
const DELIVERY_RANK: Record<MessageDelivery['status'], number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

/**
 * Envío saliente (outbound-messaging spec): valida política y canal, persiste
 * ANTES de enviar, y el worker entrega vía ChannelSender. Los estados de
 * entrega avanzan de forma monotónica e idempotente (delivery-status spec).
 */
@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);
  private readonly senders: Map<ChannelName, ChannelSender>;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    whatsapp: WhatsAppSender,
    telegram: TelegramSender,
    messenger: MessengerSender,
    instagram: InstagramSender,
  ) {
    this.senders = new Map<ChannelName, ChannelSender>([
      [whatsapp.channel, whatsapp],
      [telegram.channel, telegram],
      [messenger.channel, messenger],
      [instagram.channel, instagram],
    ]);
  }

  /** Estado de ventana del canal para una conversación (para UI y validación). */
  async getConversationWindow(
    conversationId: string,
    channel: string,
    now = new Date(),
  ): Promise<WindowState> {
    if (!WINDOWED_CHANNELS.has(channel)) return { open: true, expiresAt: null };
    const lastInbound = await this.db.query.messages.findFirst({
      where: and(eq(messages.conversationId, conversationId), eq(messages.direction, 'inbound')),
      orderBy: desc(messages.sentAt),
      columns: { sentAt: true },
    });
    return getWindowState(lastInbound?.sentAt ?? null, now);
  }

  /**
   * Valida, persiste con delivery `queued` y devuelve el mensaje. El caller
   * encola la entrega (ChannelQueuesService.enqueueOutbound). `actor`
   * distingue reclutadora (`user`) de bot (`bot`) en la auditoría.
   */
  async createOutbound(
    conversationId: string,
    input: SendInput,
    actor: 'user' | 'bot' = 'user',
  ): Promise<typeof messages.$inferSelect> {
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
    if (!conversation) {
      throw notFound('CONVERSATION_NOT_FOUND', `No existe la conversación ${conversationId}`);
    }
    if (conversation.status !== 'open') {
      throw new DomainError(
        'CONVERSATION_CLOSED',
        'No se puede enviar a una conversación cerrada',
        409,
      );
    }

    const sender = this.senders.get(conversation.channel as ChannelName);
    if (!sender) {
      throw new DomainError(
        'CHANNEL_NOT_SUPPORTED',
        `El canal ${conversation.channel} aún no soporta envío saliente`,
        409,
      );
    }
    if (!(await sender.isConfigured())) {
      throw new DomainError(
        'CHANNEL_NOT_CONFIGURED',
        `Faltan credenciales activas para enviar por ${conversation.channel}`,
        409,
      );
    }

    const content = await this.resolveContent(conversation.channel, conversationId, input);

    const messageId = randomUUID();
    const now = new Date();
    const delivery: MessageDelivery = { status: 'queued', updatedAt: now.toISOString() };
    const [message] = await this.db
      .insert(messages)
      .values({
        id: messageId,
        conversationId,
        channel: conversation.channel,
        // Placeholder único hasta que el canal devuelva su id real al enviar.
        externalMessageId: `out__${messageId}`,
        direction: 'outbound',
        type: 'text',
        body: content.body,
        delivery,
        // Todo lo necesario para que el worker entregue sin re-validar negocio.
        rawPayload: content as unknown as Record<string, unknown>,
        sentAt: now,
      })
      .returning();

    await this.db
      .update(conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(conversations.id, conversationId));

    await this.events.append({
      type: 'message.sent',
      aggregateType: 'message',
      aggregateId: messageId,
      actor,
      payload: {
        conversationId,
        channel: conversation.channel,
        kind: content.kind,
        ...(content.template ? { templateName: content.template.name } : {}),
      },
    });

    return message!;
  }

  /** Ejecutado por el worker `channels.outbound`: entrega y marca `sent`. */
  async deliver(messageId: string): Promise<void> {
    const message = await this.db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
    if (!message || message.direction !== 'outbound') return;
    if (message.delivery && message.delivery.status !== 'queued') return; // ya entregado

    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, message.conversationId),
    });
    if (!conversation) return;

    const sender = this.senders.get(message.channel as ChannelName);
    if (!sender || !(await sender.isConfigured())) {
      throw new DomainError(
        'CHANNEL_NOT_CONFIGURED',
        `Canal ${message.channel} sin credenciales al entregar`,
      );
    }

    const identity = await this.db.query.channelIdentities.findFirst({
      where: and(
        eq(channelIdentities.personId, conversation.personId),
        eq(channelIdentities.channel, message.channel),
      ),
    });
    if (!identity) {
      throw new DomainError(
        'IDENTITY_NOT_FOUND',
        `La persona ${conversation.personId} no tiene identidad en ${message.channel}`,
      );
    }

    const content = message.rawPayload as unknown as OutboundContent;
    const { externalMessageId } = await sender.send(identity.externalId, content);

    await this.db
      .update(messages)
      .set({
        externalMessageId,
        delivery: {
          status: 'sent',
          externalId: externalMessageId,
          updatedAt: new Date().toISOString(),
        },
      })
      .where(eq(messages.id, messageId));

    await this.events.append({
      type: 'message.delivery_updated',
      aggregateType: 'message',
      aggregateId: messageId,
      actor: 'system',
      payload: { conversationId: message.conversationId, status: 'sent', externalMessageId },
    });
  }

  /** Reintentos agotados en el worker: el mensaje queda `failed` con su error. */
  async markFailed(messageId: string, error: string): Promise<void> {
    const message = await this.db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
    if (!message?.delivery || message.delivery.status !== 'queued') return;

    await this.db
      .update(messages)
      .set({
        delivery: { ...message.delivery, status: 'failed', error, updatedAt: new Date().toISOString() },
      })
      .where(eq(messages.id, messageId));

    await this.events.append({
      type: 'message.delivery_updated',
      aggregateType: 'message',
      aggregateId: messageId,
      actor: 'system',
      payload: { conversationId: message.conversationId, status: 'failed', error },
    });
  }

  /**
   * Aplica un status del canal (webhook `statuses`) por id externo, con
   * avance monotónico. Idempotente: sin avance no hay update ni evento.
   */
  async applyDeliveryStatus(
    channel: string,
    externalMessageId: string,
    status: MessageDelivery['status'],
    error?: string,
  ): Promise<void> {
    const message = await this.db.query.messages.findFirst({
      where: and(
        eq(messages.channel, channel),
        eq(messages.externalMessageId, externalMessageId),
      ),
    });
    if (!message || message.direction !== 'outbound' || !message.delivery) {
      this.logger.log(`Status ${status} para mensaje desconocido ${channel}/${externalMessageId}`);
      return;
    }
    if (DELIVERY_RANK[status] <= DELIVERY_RANK[message.delivery.status]) return;

    await this.db
      .update(messages)
      .set({
        delivery: {
          ...message.delivery,
          status,
          ...(error ? { error } : {}),
          updatedAt: new Date().toISOString(),
        },
      })
      .where(eq(messages.id, message.id));

    await this.events.append({
      type: 'message.delivery_updated',
      aggregateType: 'message',
      aggregateId: message.id,
      actor: 'channel',
      payload: {
        conversationId: message.conversationId,
        status,
        ...(error ? { error } : {}),
      },
    });
  }

  private async resolveContent(
    channel: string,
    conversationId: string,
    input: SendInput,
  ): Promise<OutboundContent> {
    if (input.kind === 'text') {
      const window = await this.getConversationWindow(conversationId, channel);
      if (!window.open) {
        throw new DomainError(
          'WINDOW_EXPIRED',
          channel === 'whatsapp'
            ? 'La ventana de 24 h de WhatsApp expiró: usa una plantilla aprobada'
            : `La ventana de 24 h de ${channel} expiró: espera un mensaje del contacto`,
          409,
        );
      }
      return { kind: 'text', body: input.body };
    }

    // Las plantillas aprobadas son un mecanismo exclusivo de WhatsApp.
    if (channel !== 'whatsapp') {
      throw new DomainError(
        'TEMPLATES_NOT_SUPPORTED',
        `El canal ${channel} no soporta plantillas; solo texto dentro de la ventana`,
        409,
      );
    }

    const template = await this.db.query.messageTemplates.findFirst({
      where: eq(messageTemplates.id, input.templateId),
    });
    if (!template) {
      throw notFound('TEMPLATE_NOT_FOUND', `No existe la plantilla ${input.templateId}`);
    }
    if (!template.active || template.status !== 'approved') {
      throw new DomainError('TEMPLATE_NOT_AVAILABLE', 'La plantilla no está activa/aprobada', 409);
    }
    if (template.channel !== channel) {
      throw new DomainError(
        'TEMPLATE_CHANNEL_MISMATCH',
        `La plantilla es de ${template.channel}, la conversación de ${channel}`,
        409,
      );
    }
    if (input.variables.length !== template.variablesCount) {
      throw new DomainError('VALIDATION_ERROR', 'Número de variables incorrecto', 400, {
        issues: [
          {
            path: 'variables',
            message: `la plantilla espera ${template.variablesCount} variables, llegaron ${input.variables.length}`,
          },
        ],
      });
    }

    // Cuerpo renderizado para que el historial del inbox sea legible.
    const body = template.body.replace(/\{\{(\d+)\}\}/g, (raw, n: string) => {
      const value = input.variables[Number(n) - 1];
      return value ?? raw;
    });

    return {
      kind: 'template',
      body,
      template: {
        name: template.name,
        language: template.language,
        variables: input.variables,
      },
    };
  }
}
