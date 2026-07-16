import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { channelIdentities, conversations, messages, people } from '../database/schema';
import { DomainEventsService } from '../events/domain-events.service';
import { LeadPipelineService } from '../leads/lead-pipeline.service';
import { SettingsService } from '../settings/settings.service';
import { NormalizedInboundMessage } from './channel-adapter';

const DEFAULT_INACTIVITY_DAYS = 21;

interface ResolvedPerson {
  personId: string;
  personCreated: boolean;
}

export interface IngestedMessage {
  messageId: string;
  hasMedia: boolean;
}

interface ResolvedConversation {
  conversationId: string;
  conversationCreated: boolean;
  /** Conversación previa cerrada por inactividad en esta resolución, si la hubo. */
  closedConversationId: string | null;
}

/**
 * Persistencia idempotente de mensajes entrantes.
 *
 * Resolución de persona: identidad de canal existente → persona con el mismo
 * teléfono E.164 → crear. El mensaje se inserta con ON CONFLICT DO NOTHING
 * sobre unique(channel, external_message_id): un reintento del proveedor no
 * produce filas ni eventos nuevos, y tampoco re-ejecuta el pipeline de leads.
 *
 * Ciclo de conversación: una conversación abierta cuyo último mensaje es más
 * viejo que `conversation_inactivity_days` (configurable, default 21) se
 * cierra al resolver y el mensaje nuevo abre otra. Nada se borra.
 */
@Injectable()
export class MessageIngestionService {
  private readonly logger = new Logger(MessageIngestionService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    private readonly settings: SettingsService,
    private readonly leadPipeline: LeadPipelineService,
  ) {}

  async ingest(inbound: NormalizedInboundMessage[]): Promise<IngestedMessage[]> {
    const results: IngestedMessage[] = [];
    for (const message of inbound) {
      const result = await this.ingestOne(message);
      if (result) results.push(result);
    }
    return results;
  }

  private async ingestOne(inbound: NormalizedInboundMessage): Promise<IngestedMessage | null> {
    const inactivityDays = await this.settings.getNumber(
      'conversation_inactivity_days',
      DEFAULT_INACTIVITY_DAYS,
    );

    const outcome = await this.db.transaction(async (tx) => {
      const { personId, personCreated } = await this.resolvePerson(tx, inbound);
      const conversation = await this.resolveConversation(tx, personId, inbound, inactivityDays);

      const inserted = await tx
        .insert(messages)
        .values({
          conversationId: conversation.conversationId,
          channel: inbound.channel,
          externalMessageId: inbound.externalMessageId,
          direction: 'inbound',
          type: inbound.kind,
          media: inbound.media
            ? {
                externalId: inbound.media.externalId,
                mimeType: inbound.media.mimeType,
                filename: inbound.media.filename,
                status: 'pending' as const,
              }
            : null,
          sender: inbound.senderName,
          body: inbound.body,
          rawPayload: inbound.raw,
          sentAt: inbound.sentAt,
        })
        .onConflictDoNothing()
        .returning({ id: messages.id });

      const message = inserted[0];
      if (!message) {
        // Mensaje ya ingerido (reintento del proveedor): sin efectos,
        // sin pipeline y sin re-encolar media.
        return null;
      }

      await tx
        .update(conversations)
        .set({ lastMessageAt: inbound.sentAt, updatedAt: new Date() })
        .where(eq(conversations.id, conversation.conversationId));

      return { personId, personCreated, ...conversation, messageId: message.id };
    });

    if (!outcome) return null;

    // Eventos solo por hechos que ocurrieron en ESTA ingestión.
    if (outcome.personCreated) {
      await this.events.append({
        type: 'person.created',
        aggregateType: 'person',
        aggregateId: outcome.personId,
        actor: 'channel',
        payload: { channel: inbound.channel },
      });
    }
    if (outcome.closedConversationId) {
      await this.events.append({
        type: 'conversation.closed',
        aggregateType: 'conversation',
        aggregateId: outcome.closedConversationId,
        actor: 'system',
        payload: { reason: 'inactivity', inactivityDays, personId: outcome.personId },
      });
    }
    if (outcome.conversationCreated) {
      await this.events.append({
        type: 'conversation.started',
        aggregateType: 'conversation',
        aggregateId: outcome.conversationId,
        actor: 'channel',
        payload: { channel: inbound.channel, personId: outcome.personId },
      });
    }
    await this.events.append({
      type: 'message.received',
      aggregateType: 'message',
      aggregateId: outcome.messageId,
      actor: 'channel',
      payload: {
        channel: inbound.channel,
        conversationId: outcome.conversationId,
        personId: outcome.personId,
        externalMessageId: inbound.externalMessageId,
      },
      occurredAt: inbound.sentAt,
    });

    // Pipeline de leads fuera de la transacción (design decisión 8): si falla,
    // el mensaje ya está persistido y el pipeline es re-ejecutable.
    await this.leadPipeline.processMessage({
      personId: outcome.personId,
      conversationId: outcome.conversationId,
      messageId: outcome.messageId,
      inbound,
    });

    return { messageId: outcome.messageId, hasMedia: Boolean(inbound.media) };
  }

  private async resolvePerson(
    tx: Database,
    inbound: NormalizedInboundMessage,
  ): Promise<ResolvedPerson> {
    const existingIdentity = await tx.query.channelIdentities.findFirst({
      where: and(
        eq(channelIdentities.channel, inbound.channel),
        eq(channelIdentities.externalId, inbound.externalUserId),
      ),
    });
    if (existingIdentity) {
      return { personId: existingIdentity.personId, personCreated: false };
    }

    let personId: string | undefined;
    let personCreated = false;

    if (inbound.phoneE164) {
      const byPhone = await tx.query.people.findFirst({
        where: eq(people.phone, inbound.phoneE164),
      });
      personId = byPhone?.id;
    }

    if (!personId) {
      const created = await tx
        .insert(people)
        .values({ phone: inbound.phoneE164, name: inbound.senderName })
        .returning({ id: people.id });
      personId = created[0]!.id;
      personCreated = true;
    }

    await tx.insert(channelIdentities).values({
      personId,
      channel: inbound.channel,
      externalId: inbound.externalUserId,
    });

    return { personId, personCreated };
  }

  private async resolveConversation(
    tx: Database,
    personId: string,
    inbound: NormalizedInboundMessage,
    inactivityDays: number,
  ): Promise<ResolvedConversation> {
    const open = await tx.query.conversations.findFirst({
      where: and(
        eq(conversations.personId, personId),
        eq(conversations.channel, inbound.channel),
        eq(conversations.status, 'open'),
      ),
      orderBy: desc(conversations.startedAt),
    });

    let closedConversationId: string | null = null;
    if (open) {
      const reference = open.lastMessageAt ?? open.startedAt;
      const ageMs = inbound.sentAt.getTime() - reference.getTime();
      const isExpired = ageMs > inactivityDays * 24 * 60 * 60_000;
      if (!isExpired) {
        return { conversationId: open.id, conversationCreated: false, closedConversationId: null };
      }
      await tx
        .update(conversations)
        .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, open.id));
      closedConversationId = open.id;
    }

    const created = await tx
      .insert(conversations)
      .values({ personId, channel: inbound.channel, lastMessageAt: inbound.sentAt })
      .returning({ id: conversations.id });
    return {
      conversationId: created[0]!.id,
      conversationCreated: true,
      closedConversationId,
    };
  }
}
