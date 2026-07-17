import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { NormalizedInboundMessage } from '../channels/channel-adapter';
import { DB, Database } from '../database/database.module';
import { campaigns, leads } from '../database/schema';
import { DomainEventsService } from '../events/domain-events.service';
import { SchedulesService } from '../schedules/schedules.service';
import { classify } from './classification-engine';
import { ClassificationRulesService } from './classification-rules.service';
import { getLocalParts, isInWorkHours } from '../schedules/work-hours';

export interface PipelineContext {
  personId: string;
  conversationId: string;
  messageId: string;
  inbound: NormalizedInboundMessage;
}

/**
 * Pipeline determinista mensaje→lead. Corre DESPUÉS de que la ingestión
 * commitea (design decisión 8): un fallo aquí nunca pierde el mensaje, y el
 * pipeline es re-ejecutable desde messages + raw_payload.
 *
 * Reglas: un lead por persona; la clasificación solo mejora (nunca regresa a
 * `other`); la corrección humana (classification_source=human) es intocable;
 * la atribución nunca se inventa (referral o nada).
 */
@Injectable()
export class LeadPipelineService {
  private readonly logger = new Logger(LeadPipelineService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    private readonly rules: ClassificationRulesService,
    private readonly schedules: SchedulesService,
  ) {}

  async processMessage(context: PipelineContext): Promise<void> {
    try {
      const lead = await this.ensureLead(context);
      await this.classifyLead(lead.id, context);
      await this.attributeLead(lead.id, context);
    } catch (error) {
      this.logger.error(
        `Pipeline falló para mensaje ${context.messageId} (persona ${context.personId}): ${String(error)}`,
      );
    }
  }

  private async ensureLead(context: PipelineContext): Promise<{ id: string }> {
    const existing = await this.db.query.leads.findFirst({
      where: eq(leads.personId, context.personId),
    });
    if (existing) return existing;

    const schedule = await this.schedules.getDefaultSchedule();
    const sentAt = context.inbound.sentAt;
    const local = getLocalParts(sentAt, schedule.timezone);

    const inserted = await this.db
      .insert(leads)
      .values({
        personId: context.personId,
        status: 'new',
        origin: context.inbound.referral ? 'paid' : 'organic',
        firstMessageAt: sentAt,
        inWorkHours: isInWorkHours(sentAt, schedule),
        arrivalHour: local.hour,
        arrivalDay: local.weekday,
      })
      .onConflictDoNothing({ target: leads.personId })
      .returning({ id: leads.id });

    const lead =
      inserted[0] ??
      (await this.db.query.leads.findFirst({ where: eq(leads.personId, context.personId) }));
    if (!lead) throw new Error(`No se pudo crear/encontrar lead para persona ${context.personId}`);

    if (inserted[0]) {
      await this.events.append({
        type: 'lead.created',
        aggregateType: 'lead',
        aggregateId: lead.id,
        actor: 'channel',
        payload: {
          personId: context.personId,
          channel: context.inbound.channel,
          origin: context.inbound.referral ? 'paid' : 'organic',
        },
        occurredAt: sentAt,
      });
    }
    return lead;
  }

  private async classifyLead(leadId: string, context: PipelineContext): Promise<void> {
    if (!context.inbound.body) return;

    const lead = await this.db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead || lead.classificationSource === 'human') return;

    const result = classify(context.inbound.body, await this.rules.getActiveRules());

    // Acumulación conservadora: la clasificación mejora, no oscila.
    const nextClassification =
      result.classification !== 'other' ? result.classification : lead.classification;
    const nextVacancyType = result.detectedVacancyType ?? lead.detectedVacancyType;

    if (
      nextClassification === lead.classification &&
      nextVacancyType === lead.detectedVacancyType
    ) {
      return;
    }

    await this.db
      .update(leads)
      .set({
        classification: nextClassification,
        detectedVacancyType: nextVacancyType,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    await this.events.append({
      type: 'lead.classified',
      aggregateType: 'lead',
      aggregateId: leadId,
      actor: 'system',
      payload: {
        classification: nextClassification,
        detectedVacancyType: nextVacancyType,
        matchedRuleId: result.matchedRuleId,
        isAdCta: result.isAdCta,
        messageId: context.messageId,
      },
    });
  }

  /**
   * Re-atribución de referrals huérfanos (campaign-attribution spec): leads
   * que guardaron `referralPayload` sin campaña local ahora pueden matchear
   * contra campañas recién sincronizadas. Misma regla que attributeLead.
   */
  async reattributeOrphans(): Promise<number> {
    const orphans = await this.db.query.leads.findMany({
      where: and(isNotNull(leads.referralPayload), isNull(leads.campaignId)),
    });

    let reattributed = 0;
    for (const lead of orphans) {
      const sourceId = (lead.referralPayload as { sourceId?: string } | null)?.sourceId;
      if (!sourceId) continue;
      const campaign = await this.db.query.campaigns.findFirst({
        where: eq(campaigns.externalId, sourceId),
      });
      if (!campaign) continue;

      await this.db
        .update(leads)
        .set({ campaignId: campaign.id, origin: 'paid', updatedAt: new Date() })
        .where(eq(leads.id, lead.id));
      await this.events.append({
        type: 'lead.attributed',
        aggregateType: 'lead',
        aggregateId: lead.id,
        actor: 'system',
        payload: { campaignId: campaign.id, sourceId, reattributed: true },
      });
      reattributed += 1;
    }
    return reattributed;
  }

  private async attributeLead(leadId: string, context: PipelineContext): Promise<void> {
    const referral = context.inbound.referral;
    if (!referral) return;

    const lead = await this.db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead || lead.campaignId) return;

    const campaign = await this.db.query.campaigns.findFirst({
      where: eq(campaigns.externalId, referral.sourceId),
    });

    if (campaign) {
      await this.db
        .update(leads)
        .set({ campaignId: campaign.id, origin: 'paid', updatedAt: new Date() })
        .where(eq(leads.id, leadId));
      await this.events.append({
        type: 'lead.attributed',
        aggregateType: 'lead',
        aggregateId: leadId,
        actor: 'system',
        payload: { campaignId: campaign.id, sourceId: referral.sourceId },
      });
    } else {
      // Campaña aún no sincronizada: guardar el referral crudo para
      // re-atribuir cuando el sync de Marketing API la traiga (change 7).
      await this.db
        .update(leads)
        .set({
          origin: 'paid',
          referralPayload: referral as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));
    }
  }
}
