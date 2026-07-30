import { Body, Controller, Inject, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { agents, channelIdentities, leads } from '../database/schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NormalizedInboundMessage } from '../channels/channel-adapter';
import { MessageIngestionService } from '../channels/message-ingestion.service';
import { DomainEventsService } from '../events/domain-events.service';
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
  leadsMetricsApplied: number;
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
    private readonly events: DomainEventsService,
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

    const leadsMetricsApplied = await this.applyFirstResponseMetrics(body.leadMetrics);

    return {
      messagesReceived: body.messages.length,
      messagesIngested: ingested.length,
      duplicates: body.messages.length - ingested.length,
      leadsAssigned,
      leadsMetricsApplied,
    };
  }

  /**
   * Persiste las métricas de primera respuesta (fuente: el export) en el lead de cada persona,
   * localizado por `externalUserId` → channel_identity → person → lead. Se sobrescribe con el valor
   * del export (autoridad del historial). Emite un evento de auditoría por lead actualizado.
   */
  private async applyFirstResponseMetrics(
    metrics: WhatsappHistoryImport['leadMetrics'],
  ): Promise<number> {
    if (!metrics || metrics.length === 0) return 0;
    let applied = 0;
    for (const metric of metrics) {
      const identity = await this.db.query.channelIdentities.findFirst({
        where: and(
          eq(channelIdentities.channel, 'whatsapp'),
          eq(channelIdentities.externalId, metric.externalUserId),
        ),
      });
      if (!identity) continue;

      const lead = await this.db.query.leads.findFirst({
        where: eq(leads.personId, identity.personId),
      });
      if (!lead) continue;

      await this.db
        .update(leads)
        .set({
          responded: metric.responded,
          firstResponseMinutesNatural: metric.firstResponseMinutesNatural,
          firstResponseMinutesWork: metric.firstResponseMinutesWork,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));

      await this.events.append({
        type: 'lead.first_response_imported',
        aggregateType: 'lead',
        aggregateId: lead.id,
        actor: 'user',
        payload: {
          source: 'whatsapp-history',
          responded: metric.responded,
          minutesWork: metric.firstResponseMinutesWork,
        },
      });
      applied += 1;
    }
    return applied;
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
