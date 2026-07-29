import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, lte, or, sql, SQL } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { agents, campaigns, leads, operators, people } from '../database/schema';
import { notFound } from '../common/domain-error';
import { decodeCursor, Page, toPage } from '../common/pagination';
import { DomainEventsService } from '../events/domain-events.service';
import { EmploymentEpisodesService } from '../employment-episodes/employment-episodes.service';
import { SchedulesService } from '../schedules/schedules.service';
import { getLocalParts, isInWorkHours } from '../schedules/work-hours';

export interface LeadListFilters {
  status?: string;
  classification?: string;
  detectedVacancyType?: string;
  assignedAgentId?: string;
  origin?: string;
  campaignId?: string;
  firstMessageFrom?: Date;
  firstMessageTo?: Date;
  limit: number;
  cursor?: string;
}

export interface LeadPatch {
  status?: string;
  notes?: string | null;
  assignedAgentId?: string | null;
  classification?: string;
  detectedVacancyType?: string | null;
}

export interface LeadView {
  id: string;
  status: string;
  classification: string;
  detectedVacancyType: string | null;
  classificationSource: string;
  origin: string | null;
  notes: string | null;
  assignedAgentId: string | null;
  firstMessageAt: Date | null;
  responded: boolean;
  firstResponseMinutesNatural: number | null;
  firstResponseMinutesWork: number | null;
  inWorkHours: boolean | null;
  arrivalHour: number | null;
  arrivalDay: number | null;
  createdAt: Date;
  person: { id: string; name: string | null; phone: string | null };
  campaign: { id: string; name: string } | null;
  operator: { id: string; empNo: string; name: string; company: string } | null;
}

/** createdAt como ISO estable para cursor keyset (mismo truco que messages). */
const createdAtIso = sql<string>`to_char(${leads.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Lecturas y overrides humanos de la bandeja de leads. El pipeline
 * (LeadPipelineService) es la única vía de escritura del sistema; aquí toda
 * mutación viene de un reclutador y emite su evento con actor='user'.
 */
@Injectable()
export class LeadsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
    private readonly schedules: SchedulesService,
    private readonly episodes: EmploymentEpisodesService,
  ) {}

  /**
   * Recalcula las métricas de jornada derivadas (inWorkHours, arrivalHour, arrivalDay) de los
   * leads existentes contra el work_schedule vigente, con la misma lógica que usa el pipeline al
   * ingerir. Reutilizable cada vez que el horario oficial cambie. No toca firstMessageAt ni estado.
   */
  async recalculateScheduleMetrics(): Promise<{ scanned: number; updated: number }> {
    const schedule = await this.schedules.getDefaultSchedule();
    const rows = await this.db
      .select({
        id: leads.id,
        firstMessageAt: leads.firstMessageAt,
        inWorkHours: leads.inWorkHours,
        arrivalHour: leads.arrivalHour,
        arrivalDay: leads.arrivalDay,
      })
      .from(leads);

    let updated = 0;
    for (const row of rows) {
      if (!row.firstMessageAt) continue; // leads sin primer mensaje quedan intactos
      const local = getLocalParts(row.firstMessageAt, schedule.timezone);
      const inWork = isInWorkHours(row.firstMessageAt, schedule);
      if (
        row.inWorkHours === inWork &&
        row.arrivalHour === local.hour &&
        row.arrivalDay === local.weekday
      ) {
        continue; // ya coincide con el horario vigente
      }
      await this.db
        .update(leads)
        .set({
          inWorkHours: inWork,
          arrivalHour: local.hour,
          arrivalDay: local.weekday,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, row.id));
      updated += 1;
    }

    await this.events.append({
      type: 'lead.schedule_metrics_recalculated',
      aggregateType: 'lead',
      aggregateId: 'all',
      actor: 'user',
      payload: { scanned: rows.length, updated },
    });

    return { scanned: rows.length, updated };
  }

  async list(filters: LeadListFilters): Promise<Page<LeadView>> {
    const conditions: (SQL | undefined)[] = [
      filters.status ? eq(leads.status, filters.status) : undefined,
      filters.classification ? eq(leads.classification, filters.classification) : undefined,
      filters.detectedVacancyType
        ? eq(leads.detectedVacancyType, filters.detectedVacancyType)
        : undefined,
      filters.assignedAgentId ? eq(leads.assignedAgentId, filters.assignedAgentId) : undefined,
      filters.origin ? eq(leads.origin, filters.origin) : undefined,
      filters.campaignId ? eq(leads.campaignId, filters.campaignId) : undefined,
      filters.firstMessageFrom ? gte(leads.firstMessageAt, filters.firstMessageFrom) : undefined,
      filters.firstMessageTo ? lte(leads.firstMessageAt, filters.firstMessageTo) : undefined,
    ];
    if (filters.cursor) {
      const [at, id] = decodeCursor(filters.cursor);
      conditions.push(
        or(lt(createdAtIso, at), and(eq(createdAtIso, at), lt(leads.id, id))),
      );
    }

    const rows = await this.db
      .select({ ...this.selection(), createdAtIso })
      .from(leads)
      .innerJoin(people, eq(leads.personId, people.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .leftJoin(operators, eq(leads.matchedOperatorId, operators.id))
      .where(and(...conditions.filter((c): c is SQL => c !== undefined)))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(filters.limit + 1);

    const page = toPage(rows, filters.limit, (r) => [r.createdAtIso, r.lead.id]);
    return { items: page.items.map((r) => this.toView(r)), nextCursor: page.nextCursor };
  }

  async getById(id: string): Promise<LeadView> {
    return this.toView(await this.findJoined(id));
  }

  async update(id: string, patch: LeadPatch): Promise<LeadView> {
    const current = (await this.findJoined(id)).lead;

    const changes: Record<string, unknown> = {};
    if (patch.status !== undefined && patch.status !== current.status) {
      changes.status = patch.status;
    }
    if (patch.notes !== undefined && patch.notes !== current.notes) {
      changes.notes = patch.notes;
    }
    if (
      patch.assignedAgentId !== undefined &&
      patch.assignedAgentId !== current.assignedAgentId
    ) {
      if (patch.assignedAgentId !== null) {
        const agent = await this.db.query.agents.findFirst({
          where: eq(agents.id, patch.assignedAgentId),
        });
        if (!agent) {
          throw notFound('AGENT_NOT_FOUND', `No existe el agente ${patch.assignedAgentId}`);
        }
      }
      changes.assignedAgentId = patch.assignedAgentId;
    }
    if (patch.classification !== undefined && patch.classification !== current.classification) {
      changes.classification = patch.classification;
    }
    if (
      patch.detectedVacancyType !== undefined &&
      patch.detectedVacancyType !== current.detectedVacancyType
    ) {
      changes.detectedVacancyType = patch.detectedVacancyType;
    }
    // Cualquier corrección de clasificación es humana: el pipeline no la pisa.
    if ('classification' in changes || 'detectedVacancyType' in changes) {
      changes.classificationSource = 'human';
    }

    if (Object.keys(changes).length > 0) {
      await this.db
        .update(leads)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(leads.id, id));

      await this.events.append({
        type: 'lead.updated',
        aggregateType: 'lead',
        aggregateId: id,
        actor: 'user',
        payload: { changes },
      });
    }

    return this.getById(id);
  }

  async linkOperator(id: string, operatorId: string | null): Promise<LeadView> {
    const current = (await this.findJoined(id)).lead;

    let operator: typeof operators.$inferSelect | undefined;
    if (operatorId !== null) {
      operator = await this.db.query.operators.findFirst({
        where: eq(operators.id, operatorId),
      });
      if (!operator) throw notFound('OPERATOR_NOT_FOUND', `No existe el operador ${operatorId}`);
    }

    if (current.matchedOperatorId !== operatorId) {
      await this.db
        .update(leads)
        .set({ matchedOperatorId: operatorId, updatedAt: new Date() })
        .where(eq(leads.id, id));

      await this.events.append({
        type: 'lead.operator_matched',
        aggregateType: 'lead',
        aggregateId: id,
        actor: 'user',
        payload: { operatorId, previousOperatorId: current.matchedOperatorId },
      });

      // Abre/enriquece el episodio laboral inmutable de la contratación (snapshot de atribución).
      if (operatorId !== null && operator) {
        await this.episodes.ensureForOperator(operatorId, {
          personId: current.personId,
          leadId: id,
          hiredByAgentId: current.assignedAgentId,
          campaignId: current.campaignId,
          hireDate: operator.hireDate,
        });
      }
    }

    return this.getById(id);
  }

  private selection() {
    return {
      lead: leads,
      person: { id: people.id, name: people.name, phone: people.phone },
      campaign: { id: campaigns.id, name: campaigns.name },
      operator: {
        id: operators.id,
        empNo: operators.empNo,
        name: operators.name,
        company: operators.company,
      },
    };
  }

  private async findJoined(id: string): Promise<JoinedLead> {
    const rows = await this.db
      .select(this.selection())
      .from(leads)
      .innerJoin(people, eq(leads.personId, people.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .leftJoin(operators, eq(leads.matchedOperatorId, operators.id))
      .where(eq(leads.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw notFound('LEAD_NOT_FOUND', `No existe el lead ${id}`);
    return row;
  }

  private toView(row: JoinedLead): LeadView {
    const { lead } = row;
    return {
      id: lead.id,
      status: lead.status,
      classification: lead.classification,
      detectedVacancyType: lead.detectedVacancyType,
      classificationSource: lead.classificationSource,
      origin: lead.origin,
      notes: lead.notes,
      assignedAgentId: lead.assignedAgentId,
      firstMessageAt: lead.firstMessageAt,
      responded: lead.responded,
      firstResponseMinutesNatural: lead.firstResponseMinutesNatural,
      firstResponseMinutesWork: lead.firstResponseMinutesWork,
      inWorkHours: lead.inWorkHours,
      arrivalHour: lead.arrivalHour,
      arrivalDay: lead.arrivalDay,
      createdAt: lead.createdAt,
      person: row.person,
      campaign: row.campaign?.id ? { id: row.campaign.id, name: row.campaign.name } : null,
      operator: row.operator?.id
        ? {
            id: row.operator.id,
            empNo: row.operator.empNo,
            name: row.operator.name,
            company: row.operator.company,
          }
        : null,
    };
  }
}

interface JoinedLead {
  lead: typeof leads.$inferSelect;
  person: { id: string; name: string | null; phone: string | null };
  campaign: { id: string; name: string } | null;
  operator: { id: string; empNo: string; name: string; company: string } | null;
}
