import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql, asc, gt, SQL } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { agents, conversations, messages, people } from '../database/schema';
import { DomainError, notFound } from '../common/domain-error';
import { decodeCursor, Page, toPage } from '../common/pagination';
import { DomainEventsService } from '../events/domain-events.service';
import { OutboundService } from '../channels/outbound.service';

export interface ConversationListFilters {
  status?: string;
  channel?: string;
  assignedAgentId?: string;
  attentionMode?: string;
  personId?: string;
  limit: number;
  cursor?: string;
}

export interface ConversationView {
  id: string;
  channel: string;
  status: string;
  attentionMode: string;
  assignedAgentId: string | null;
  startedAt: Date;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  person: { id: string; name: string | null; phone: string | null };
  /** Solo en el detalle: política de ventana del canal (whatsapp-window-policy). */
  canSendFreeform?: boolean;
  windowExpiresAt?: Date | null;
}

export interface MessageView {
  id: string;
  direction: string;
  type: string;
  sender: string | null;
  body: string | null;
  sentAt: Date;
  media: { status: string; mimeType?: string; filename?: string } | null;
  /** Solo outbound: estado de entrega (delivery-status spec). */
  delivery: { status: string; error?: string } | null;
}

/** Actividad de la conversación: último mensaje o, si aún no hay, su inicio. */
const activityAt = sql<string>`coalesce(${conversations.lastMessageAt}, ${conversations.startedAt})`;

/**
 * Consultas y comandos del inbox. Toda mutación proviene de una persona
 * usando la UI, así que emite su domain_event con actor='user'.
 */
@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    private readonly outbound: OutboundService,
  ) {}

  async list(filters: ConversationListFilters): Promise<Page<ConversationView>> {
    const conditions: (SQL | undefined)[] = [
      filters.status ? eq(conversations.status, filters.status) : undefined,
      filters.channel ? eq(conversations.channel, filters.channel) : undefined,
      filters.assignedAgentId ? eq(conversations.assignedAgentId, filters.assignedAgentId) : undefined,
      filters.attentionMode ? eq(conversations.attentionMode, filters.attentionMode) : undefined,
      filters.personId ? eq(conversations.personId, filters.personId) : undefined,
    ];
    if (filters.cursor) {
      const [at, id] = decodeCursor(filters.cursor);
      conditions.push(
        or(
          lt(activityAt, at),
          and(eq(activityAt, at), lt(conversations.id, id)),
        ),
      );
    }

    const rows = await this.db
      .select({
        conversation: conversations,
        person: { id: people.id, name: people.name, phone: people.phone },
        activityAt,
      })
      .from(conversations)
      .innerJoin(people, eq(conversations.personId, people.id))
      .where(and(...conditions.filter((c): c is SQL => c !== undefined)))
      .orderBy(desc(activityAt), desc(conversations.id))
      .limit(filters.limit + 1);

    const page = toPage(rows, filters.limit, (row) => [row.activityAt, row.conversation.id]);
    return {
      items: page.items.map((row) => this.toView(row.conversation, row.person)),
      nextCursor: page.nextCursor,
    };
  }

  async getById(id: string): Promise<ConversationView> {
    const row = await this.findWithPerson(id);
    const window = await this.outbound.getConversationWindow(id, row.conversation.channel);
    return {
      ...this.toView(row.conversation, row.person),
      canSendFreeform: window.open,
      windowExpiresAt: window.expiresAt,
    };
  }

  async listMessages(
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<MessageView>> {
    await this.findWithPerson(conversationId); // 404 tipado si no existe

    const sentAtIso = sql<string>`to_char(${messages.sentAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    const conditions: SQL[] = [eq(messages.conversationId, conversationId)];
    if (cursor) {
      const [at, id] = decodeCursor(cursor);
      const after = or(gt(sentAtIso, at), and(eq(sentAtIso, at), gt(messages.id, id)));
      if (after) conditions.push(after);
    }

    const rows = await this.db
      .select({ message: messages, sentAtIso })
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.sentAt), asc(messages.id))
      .limit(limit + 1);

    const page = toPage(rows, limit, (row) => [row.sentAtIso, row.message.id]);
    return {
      items: page.items.map((row) => ({
        id: row.message.id,
        direction: row.message.direction,
        type: row.message.type,
        sender: row.message.sender,
        body: row.message.body,
        sentAt: row.message.sentAt,
        media: row.message.media
          ? {
              status: row.message.media.status,
              mimeType: row.message.media.mimeType,
              filename: row.message.media.filename,
            }
          : null,
        delivery: row.message.delivery
          ? {
              status: row.message.delivery.status,
              ...(row.message.delivery.error ? { error: row.message.delivery.error } : {}),
            }
          : null,
      })),
      nextCursor: page.nextCursor,
    };
  }

  async assignAgent(conversationId: string, agentId: string | null): Promise<ConversationView> {
    const { conversation, person } = await this.findWithPerson(conversationId);

    if (agentId !== null) {
      const agent = await this.db.query.agents.findFirst({ where: eq(agents.id, agentId) });
      if (!agent) throw notFound('AGENT_NOT_FOUND', `No existe el agente ${agentId}`);
      if (!agent.active) {
        throw new DomainError('AGENT_INACTIVE', `El agente ${agent.name} está inactivo`, 409);
      }
    }

    await this.db
      .update(conversations)
      .set({ assignedAgentId: agentId, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    await this.events.append({
      type: 'conversation.assigned',
      aggregateType: 'conversation',
      aggregateId: conversationId,
      actor: 'user',
      payload: { agentId, previousAgentId: conversation.assignedAgentId },
    });

    return this.toView({ ...conversation, assignedAgentId: agentId }, person);
  }

  async setAttentionMode(conversationId: string, mode: 'human' | 'bot'): Promise<ConversationView> {
    const { conversation, person } = await this.findWithPerson(conversationId);

    if (conversation.attentionMode !== mode) {
      await this.db
        .update(conversations)
        .set({ attentionMode: mode, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      await this.events.append({
        type: 'conversation.attention_mode_changed',
        aggregateType: 'conversation',
        aggregateId: conversationId,
        actor: 'user',
        payload: { mode, previousMode: conversation.attentionMode },
      });
    }

    return this.toView({ ...conversation, attentionMode: mode }, person);
  }

  async close(conversationId: string): Promise<ConversationView> {
    const { conversation, person } = await this.findWithPerson(conversationId);
    if (conversation.status === 'closed') {
      throw new DomainError(
        'CONVERSATION_ALREADY_CLOSED',
        'La conversación ya está cerrada',
        409,
      );
    }

    const closedAt = new Date();
    await this.db
      .update(conversations)
      .set({ status: 'closed', closedAt, updatedAt: closedAt })
      .where(eq(conversations.id, conversationId));

    await this.events.append({
      type: 'conversation.closed',
      aggregateType: 'conversation',
      aggregateId: conversationId,
      actor: 'user',
      payload: { reason: 'manual', personId: conversation.personId },
    });

    return this.toView({ ...conversation, status: 'closed', closedAt }, person);
  }

  private async findWithPerson(id: string): Promise<{
    conversation: typeof conversations.$inferSelect;
    person: { id: string; name: string | null; phone: string | null };
  }> {
    const rows = await this.db
      .select({
        conversation: conversations,
        person: { id: people.id, name: people.name, phone: people.phone },
      })
      .from(conversations)
      .innerJoin(people, eq(conversations.personId, people.id))
      .where(eq(conversations.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw notFound('CONVERSATION_NOT_FOUND', `No existe la conversación ${id}`);
    return row;
  }

  private toView(
    conversation: typeof conversations.$inferSelect,
    person: { id: string; name: string | null; phone: string | null },
  ): ConversationView {
    return {
      id: conversation.id,
      channel: conversation.channel,
      status: conversation.status,
      attentionMode: conversation.attentionMode,
      assignedAgentId: conversation.assignedAgentId,
      startedAt: conversation.startedAt,
      lastMessageAt: conversation.lastMessageAt,
      closedAt: conversation.closedAt,
      person,
    };
  }
}
