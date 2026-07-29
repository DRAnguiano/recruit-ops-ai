import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { agents, campaigns, employmentEpisodes, leads, operators } from '../database/schema';
import { DomainEventsService } from '../events/domain-events.service';

export interface HireAttribution {
  personId?: string | null;
  leadId?: string | null;
  hiredByAgentId?: string | null;
  campaignId?: string | null;
  hireDate?: string | null;
}

export interface EmploymentEpisodeView {
  id: string;
  operatorId: string;
  operatorEmpNo: string;
  operatorName: string;
  hireDate: string | null;
  episodeType: string;
  hiredByAgentName: string | null;
  campaignName: string | null;
}

/**
 * Registro inmutable de contratación (employment-episodes): un episodio por operador, con snapshot
 * de reclutador que contrató y campaña atribuida. Los campos de atribución se fijan una sola vez —
 * `ensureForOperator` nunca sobrescribe un valor ya presente, solo rellena nulos.
 */
@Injectable()
export class EmploymentEpisodesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Abre el episodio del operador si no existe (snapshot inicial de la atribución); si ya existe,
   * rellena una sola vez los campos que sigan en null. Nunca pisa un valor ya fijado.
   */
  async ensureForOperator(operatorId: string, attribution: HireAttribution): Promise<void> {
    const existing = await this.db.query.employmentEpisodes.findFirst({
      where: eq(employmentEpisodes.operatorId, operatorId),
    });

    if (!existing) {
      const episodeType = await this.determineEpisodeType(attribution.personId ?? null);
      const inserted = await this.db
        .insert(employmentEpisodes)
        .values({
          operatorId,
          personId: attribution.personId ?? null,
          leadId: attribution.leadId ?? null,
          hiredByAgentId: attribution.hiredByAgentId ?? null,
          campaignId: attribution.campaignId ?? null,
          hireDate: attribution.hireDate ?? null,
          episodeType,
        })
        .onConflictDoNothing({ target: employmentEpisodes.operatorId })
        .returning({ id: employmentEpisodes.id });

      if (inserted[0]) {
        await this.events.append({
          type: 'employment_episode.created',
          aggregateType: 'employment_episode',
          aggregateId: inserted[0].id,
          actor: 'user',
          payload: { operatorId, episodeType, ...attribution },
        });
      }
      return;
    }

    // Rellenar una sola vez los campos que sigan sin valor; nunca sobrescribir uno ya fijado.
    const fill: Record<string, unknown> = {};
    if (existing.personId === null && attribution.personId) fill.personId = attribution.personId;
    if (existing.leadId === null && attribution.leadId) fill.leadId = attribution.leadId;
    if (existing.hiredByAgentId === null && attribution.hiredByAgentId) {
      fill.hiredByAgentId = attribution.hiredByAgentId;
    }
    if (existing.campaignId === null && attribution.campaignId) {
      fill.campaignId = attribution.campaignId;
    }
    if (existing.hireDate === null && attribution.hireDate) fill.hireDate = attribution.hireDate;

    if (Object.keys(fill).length > 0) {
      await this.db
        .update(employmentEpisodes)
        .set({ ...fill, updatedAt: new Date() })
        .where(eq(employmentEpisodes.id, existing.id));
    }
  }

  /** 'rehire' si la persona ya tiene un episodio previo (de otra contratación); 'new' si no. */
  private async determineEpisodeType(personId: string | null): Promise<'new' | 'rehire'> {
    if (!personId) return 'new';
    const prior = await this.db.query.employmentEpisodes.findFirst({
      where: eq(employmentEpisodes.personId, personId),
    });
    return prior ? 'rehire' : 'new';
  }

  /**
   * Un episodio por cada operador existente, tomando la atribución del lead casado por
   * `matched_operator_id` cuando exista. Idempotente (reejecutable sin duplicar ni pisar datos).
   */
  async backfill(): Promise<{ scanned: number }> {
    const allOperators = await this.db.query.operators.findMany();
    for (const operator of allOperators) {
      const matchedLead = await this.db.query.leads.findFirst({
        where: eq(leads.matchedOperatorId, operator.id),
      });
      await this.ensureForOperator(operator.id, {
        personId: matchedLead?.personId ?? null,
        leadId: matchedLead?.id ?? null,
        hiredByAgentId: matchedLead?.assignedAgentId ?? null,
        campaignId: matchedLead?.campaignId ?? null,
        hireDate: operator.hireDate,
      });
    }
    return { scanned: allOperators.length };
  }

  async list(): Promise<EmploymentEpisodeView[]> {
    const rows = await this.db
      .select({
        id: employmentEpisodes.id,
        operatorId: employmentEpisodes.operatorId,
        operatorEmpNo: operators.empNo,
        operatorName: operators.name,
        hireDate: employmentEpisodes.hireDate,
        episodeType: employmentEpisodes.episodeType,
        hiredByAgentName: agents.name,
        campaignName: campaigns.name,
      })
      .from(employmentEpisodes)
      .innerJoin(operators, eq(employmentEpisodes.operatorId, operators.id))
      .leftJoin(agents, eq(employmentEpisodes.hiredByAgentId, agents.id))
      .leftJoin(campaigns, eq(employmentEpisodes.campaignId, campaigns.id));

    return rows.map((r) => ({
      ...r,
      hiredByAgentName: r.hiredByAgentName ?? null,
      campaignName: r.campaignName ?? null,
    }));
  }
}
