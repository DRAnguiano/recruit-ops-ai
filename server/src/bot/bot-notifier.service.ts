import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { conversations, leads, messages, people } from '../database/schema';
import { DomainError } from '../common/domain-error';
import { loadEnv } from '../config/env';
import { OutboundService } from '../channels/outbound.service';
import { signBotBody } from './bot-signature';

/**
 * CRM → bot (bot-gateway spec): arma el payload del contrato v1 y hace el
 * POST firmado a BOT_WEBHOOK_URL. El bot recibe TODO lo que necesita para
 * conversar (ventana incluida) pero ninguna capacidad de decidir: sus
 * acciones vuelven por /bot/v1/actions contra el catálogo cerrado.
 */
@Injectable()
export class BotNotifierService {
  private readonly logger = new Logger(BotNotifierService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly outbound: OutboundService,
  ) {}

  isConfigured(): boolean {
    const env = loadEnv();
    return Boolean(env.BOT_WEBHOOK_URL && env.BOT_SHARED_SECRET);
  }

  /** true si la conversación del mensaje está en modo bot (chequeo al encolar). */
  async shouldNotify(conversationId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: { attentionMode: true, status: true },
    });
    return conversation?.attentionMode === 'bot' && conversation.status === 'open';
  }

  /** Ejecutado por el worker `bot.notify`: re-verifica modo y hace el POST. */
  async notify(messageId: string): Promise<void> {
    const env = loadEnv();
    if (!this.isConfigured()) return;

    const message = await this.db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
    if (!message || message.direction !== 'inbound') return;

    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, message.conversationId),
    });
    // El modo pudo cambiar entre encolar y procesar: la toma humana silencia al bot.
    if (!conversation || conversation.attentionMode !== 'bot' || conversation.status !== 'open') {
      return;
    }

    const [person, lead, window] = await Promise.all([
      this.db.query.people.findFirst({ where: eq(people.id, conversation.personId) }),
      this.db.query.leads.findFirst({ where: eq(leads.personId, conversation.personId) }),
      this.outbound.getConversationWindow(conversation.id, conversation.channel),
    ]);

    const baseUrl = env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`;
    const payload = {
      contractVersion: 1 as const,
      event: 'message.received' as const,
      conversation: {
        id: conversation.id,
        channel: conversation.channel,
        attentionMode: conversation.attentionMode,
        canSendFreeform: window.open,
        windowExpiresAt: window.expiresAt,
      },
      person: person
        ? { id: person.id, name: person.name, phone: person.phone }
        : null,
      lead: lead
        ? {
            id: lead.id,
            classification: lead.classification,
            detectedVacancyType: lead.detectedVacancyType,
            status: lead.status,
          }
        : null,
      message: {
        id: message.id,
        type: message.type,
        body: message.body,
        sentAt: message.sentAt,
        ...(message.media?.status === 'stored'
          ? { mediaUrl: `${baseUrl}/api/messages/${message.id}/media` }
          : {}),
      },
    };

    const body = JSON.stringify(payload);
    const response = await fetch(env.BOT_WEBHOOK_URL as string, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bot-signature': signBotBody(body, env.BOT_SHARED_SECRET as string),
      },
      body,
    });
    if (!response.ok) {
      throw new DomainError(
        'BOT_NOTIFY_FAILED',
        `El bot respondió HTTP ${response.status} para el mensaje ${messageId}`,
      );
    }
    this.logger.log(`Bot notificado: mensaje ${messageId} (${message.type})`);
  }
}
