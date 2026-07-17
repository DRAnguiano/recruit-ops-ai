import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { conversations, leads, messages } from '../database/schema';
import { DomainError, notFound } from '../common/domain-error';
import { DomainEventsService } from '../events/domain-events.service';
import { ChannelQueuesService } from '../channels/channel-queues.service';
import { OutboundService } from '../channels/outbound.service';

export interface ExtractedField {
  key: string;
  value: string;
  evidence: { quote: string; messageId: string };
}

export type BotAction =
  | { type: 'send_message'; conversationId: string; body: string }
  | { type: 'extract_data'; conversationId: string; fields: ExtractedField[] }
  | { type: 'request_handoff'; conversationId: string; reason: string };

export interface ActionResult {
  action: BotAction['type'];
  ok: boolean;
  error?: string;
}

/**
 * Catálogo cerrado de acciones del bot (bot-actions spec). La IA nunca
 * decide: enviar reusa el pipeline validado; extraer exige evidencia
 * verificable y no muta el lead; el handoff solo va bot→humano.
 */
@Injectable()
export class BotActionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    private readonly outbound: OutboundService,
    private readonly queues: ChannelQueuesService,
  ) {}

  async execute(actions: BotAction[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    for (const action of actions) {
      try {
        if (action.type === 'send_message') await this.sendMessage(action);
        else if (action.type === 'extract_data') await this.extractData(action);
        else await this.requestHandoff(action);
        results.push({ action: action.type, ok: true });
      } catch (error) {
        results.push({
          action: action.type,
          ok: false,
          error: error instanceof DomainError ? error.code : 'INTERNAL_ERROR',
        });
      }
    }
    return results;
  }

  private async sendMessage(
    action: Extract<BotAction, { type: 'send_message' }>,
  ): Promise<void> {
    // Lock atómico (attention-lock spec): la condición vive en el UPDATE —
    // si una reclutadora tomó la conversación un instante antes, no matchea.
    const locked = await this.db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(conversations.id, action.conversationId),
          eq(conversations.attentionMode, 'bot'),
        ),
      )
      .returning({ id: conversations.id });
    if (!locked[0]) {
      throw new DomainError(
        'BOT_NOT_ACTIVE',
        'La conversación no está en modo bot (toma humana activa)',
        409,
      );
    }

    const message = await this.outbound.createOutbound(
      action.conversationId,
      { kind: 'text', body: action.body },
      'bot',
    );
    await this.queues.enqueueOutbound(message.id);
  }

  private async extractData(
    action: Extract<BotAction, { type: 'extract_data' }>,
  ): Promise<void> {
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, action.conversationId),
    });
    if (!conversation) {
      throw notFound('CONVERSATION_NOT_FOUND', `No existe la conversación ${action.conversationId}`);
    }
    const lead = await this.db.query.leads.findFirst({
      where: eq(leads.personId, conversation.personId),
    });
    if (!lead) throw notFound('LEAD_NOT_FOUND', 'La persona no tiene lead');

    // Evidencia verificable (regla §4): cita textual + mensaje real de ESTA
    // conversación. En media la cita puede ir vacía (el binario es la evidencia).
    for (const field of action.fields) {
      const message = await this.db.query.messages.findFirst({
        where: and(
          eq(messages.id, field.evidence.messageId),
          eq(messages.conversationId, action.conversationId),
        ),
      });
      if (!message) {
        throw new DomainError(
          'EVIDENCE_INVALID',
          `La evidencia de "${field.key}" referencia un mensaje ajeno a la conversación`,
          422,
        );
      }
      const isTextEvidence = message.type === 'text';
      if (isTextEvidence) {
        if (!field.evidence.quote || !(message.body ?? '').includes(field.evidence.quote)) {
          throw new DomainError(
            'EVIDENCE_INVALID',
            `La cita de "${field.key}" no aparece en el mensaje referenciado`,
            422,
          );
        }
      }
    }

    // Solo auditoría: el lead NO se muta (los campos configurables llegarán
    // con add-custom-fields y leerán estos eventos).
    await this.events.append({
      type: 'lead.data_extracted',
      aggregateType: 'lead',
      aggregateId: lead.id,
      actor: 'bot',
      payload: { conversationId: action.conversationId, fields: action.fields },
    });
  }

  private async requestHandoff(
    action: Extract<BotAction, { type: 'request_handoff' }>,
  ): Promise<void> {
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, action.conversationId),
    });
    if (!conversation) {
      throw notFound('CONVERSATION_NOT_FOUND', `No existe la conversación ${action.conversationId}`);
    }
    if (conversation.attentionMode === 'human') return; // idempotente

    await this.db
      .update(conversations)
      .set({ attentionMode: 'human', updatedAt: new Date() })
      .where(eq(conversations.id, action.conversationId));

    await this.events.append({
      type: 'conversation.attention_mode_changed',
      aggregateType: 'conversation',
      aggregateId: action.conversationId,
      actor: 'bot',
      payload: { mode: 'human', previousMode: 'bot', reason: action.reason },
    });
  }
}
