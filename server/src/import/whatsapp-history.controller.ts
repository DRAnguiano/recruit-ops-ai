import { Body, Controller, Inject, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { agents, channelIdentities, leads } from '../database/schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NormalizedInboundMessage } from '../channels/channel-adapter';
import { MessageIngestionService } from '../channels/message-ingestion.service';
import { LeadsService } from '../leads/leads.service';
import {
  WhatsappHistoryImport,
  whatsappHistoryImportSchema,
} from './whatsapp-history.schemas';

const pipe = new ZodValidationPipe(whatsappHistoryImportSchema);

export interface WhatsappHistoryImportResult {
  messagesReceived: number;
  messagesIngested: number;
  duplicates: number;
  leadsAssigned: number;
}

/**
 * Carga de historial de WhatsApp (whatsapp-history-import): ingiere lotes ya
 * parseados por el cliente reutilizando `MessageIngestionService` (misma
 * idempotencia por `(channel, external_message_id)` que la ingestión en
 * vivo). Las conversaciones nuevas nacen en `attention_mode='human'` (default
 * de schema, sin override aquí) — el bot NUNCA se dispara por datos
 * históricos, porque `BotQueue.shouldNotify` exige `attentionMode='bot'`.
 */
@Controller('import')
export class WhatsappHistoryController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ingestion: MessageIngestionService,
    private readonly leadsService: LeadsService,
  ) {}

  @Post('whatsapp-history')
  async importHistory(
    @Body(pipe) body: WhatsappHistoryImport,
  ): Promise<WhatsappHistoryImportResult> {
    const agentId = await this.resolveAgent(body.agent);

    const inbound: NormalizedInboundMessage[] = body.messages.map((m) => ({
      channel: 'whatsapp',
      kind: 'text',
      externalMessageId: m.externalMessageId,
      externalUserId: m.externalUserId,
      senderName: m.senderName,
      phoneE164: m.phoneE164,
      body: m.body,
      sentAt: m.sentAt,
      referral: m.referral,
      raw: m as unknown as Record<string, unknown>,
    }));

    const ingested = await this.ingestion.ingest(inbound);

    const leadsAssigned = await this.assignAgentToNewLeads(inbound, agentId);

    return {
      messagesReceived: body.messages.length,
      messagesIngested: ingested.length,
      duplicates: body.messages.length - ingested.length,
      leadsAssigned,
    };
  }

  /** Busca por nombre (case-insensitive tras normalizar espacios); crea si no existe. */
  private async resolveAgent(name: string): Promise<string> {
    const trimmed = name.trim();
    const existing = await this.db.query.agents.findFirst({
      where: eq(agents.name, trimmed),
    });
    if (existing) return existing.id;

    const [created] = await this.db.insert(agents).values({ name: trimmed }).returning();
    return created!.id;
  }

  /**
   * Asigna la reclutadora a los leads de las personas de este lote que aún
   * no tengan agente — nunca sobrescribe una asignación existente.
   */
  private async assignAgentToNewLeads(
    inbound: NormalizedInboundMessage[],
    agentId: string,
  ): Promise<number> {
    const phones = [...new Set(inbound.map((m) => m.externalUserId))];
    let assigned = 0;
    for (const phone of phones) {
      const identity = await this.db.query.channelIdentities.findFirst({
        where: and(
          eq(channelIdentities.channel, 'whatsapp'),
          eq(channelIdentities.externalId, phone),
        ),
      });
      if (!identity) continue;

      const lead = await this.db.query.leads.findFirst({
        where: eq(leads.personId, identity.personId),
      });
      if (!lead || lead.assignedAgentId) continue;

      await this.leadsService.update(lead.id, { assignedAgentId: agentId });
      assigned += 1;
    }
    return assigned;
  }
}
