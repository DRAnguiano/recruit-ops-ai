/**
 * Traducción dominio-inglés (API) ↔ etiquetas en español (UI existente).
 * Los estados de lead se resuelven desde el catálogo `lead-statuses`
 * (add-catalog-admin-ui); el resto de diccionarios sigue aquí.
 */

import {
  ChatLead,
  FleetData,
  JobVacancy,
  MarketingCampaign,
  MonthlyGoal,
  Operator,
  WorkScheduleSettings,
} from '../types';

// ── Tipos de la API (subset que la SPA consume) ─────────────────────────

export interface ApiLead {
  id: string;
  status: string;
  classification: string;
  detectedVacancyType: string | null;
  classificationSource: string;
  origin: string | null;
  notes: string | null;
  assignedAgentId: string | null;
  firstMessageAt: string | null;
  responded: boolean;
  firstResponseMinutesNatural: number | null;
  firstResponseMinutesWork: number | null;
  inWorkHours: boolean | null;
  arrivalHour: number | null;
  arrivalDay: number | null;
  createdAt: string;
  person: { id: string; name: string | null; phone: string | null };
  campaign: { id: string; name: string } | null;
  operator: { id: string; empNo: string; name: string; company: string } | null;
}

export interface ApiConversation {
  id: string;
  channel: string;
  status: string;
  attentionMode: string;
  assignedAgentId: string | null;
  startedAt: string;
  lastMessageAt: string | null;
  canSendFreeform?: boolean;
  windowExpiresAt?: string | null;
  person: { id: string; name: string | null; phone: string | null };
}

export interface ApiMessage {
  id: string;
  direction: string;
  type: string;
  sender: string | null;
  body: string | null;
  sentAt: string;
  media: { status: string; mimeType?: string; filename?: string } | null;
  delivery: { status: string; error?: string } | null;
}

export interface ApiAgent {
  id: string;
  name: string;
  active: boolean;
}

export interface ApiOperator {
  id: string;
  empNo: string;
  company: string;
  name: string;
  hireDate: string | null;
  status: string;
  normalizedPhones: string[];
}

export interface ApiCampaign {
  id: string;
  externalId: string | null;
  name: string;
  source: string;
  startDate: string | null;
  endDate: string | null;
  isoWeek: string | null;
  spend: string;
  currency: string;
  leadsReported: number;
  clicks: number | null;
  targetAgentId: string | null;
  modality: string | null;
  vacancyId: string | null;
  status: string;
  pauseRequestedAt: string | null;
}

export interface ApiFleet {
  id: string;
  company: string;
  totalTractors: number;
  tractorsInService: number;
  tractorsWithoutOperator: number;
  activeServices: number;
}

export interface ApiGoal {
  id: string;
  /** weekly | monthly (metas por periodo: configurable-catalogs). */
  periodKind: string;
  company: string;
  vacancyType: string;
  circuit: string | null;
  target: number;
}

export interface ApiVacancy {
  id: string;
  type: string;
  circuit: string | null;
  modality: string;
  company: string;
  quota: number;
  status: string;
}

export interface ApiWorkSchedule {
  id: string;
  name: string;
  workDays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
}

// ── Diccionarios EN ↔ ES ────────────────────────────────────────────────

const invert = (record: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [v, k]));

export const CLASSIFICATION_ES: Record<string, ChatLead['classification']> = {
  vacancy: 'Vacante',
  internal_hr: 'RH Interno',
  other: 'Otro',
};
export const CLASSIFICATION_EN = invert(CLASSIFICATION_ES);

export const VACANCY_TYPE_ES: Record<string, string> = {
  sencillo: 'Sencillo',
  full: 'Full',
  quinta_rueda: '5ta Rueda',
  escuelita: 'Escuelita',
};
export const VACANCY_TYPE_EN = invert(VACANCY_TYPE_ES);

const MODALITY_ES: Record<string, 'Local' | 'Foráneo'> = { local: 'Local', foreign: 'Foráneo' };
const MODALITY_EN = invert(MODALITY_ES);

const CAMPAIGN_STATUS_ES: Record<string, 'Activa' | 'Pausada'> = {
  active: 'Activa',
  paused: 'Pausada',
};
const VACANCY_STATUS_ES: Record<string, JobVacancy['status']> = {
  open: 'Abierta',
  paused: 'Pausada',
  closed: 'Cerrada',
};
const VACANCY_STATUS_EN = invert(VACANCY_STATUS_ES);

const OPERATOR_STATUS_ES: Record<string, Operator['status']> = {
  active: 'Activo',
  leaving: 'Proceso Baja',
};

/** E.164 → últimos 10 dígitos (formato histórico de la UI). */
export function toUiPhone(e164: string | null): string {
  const digits = (e164 ?? '').replace(/\D/g, '');
  return digits.slice(-10);
}

// ── Mapeos API → UI ─────────────────────────────────────────────────────

/**
 * Label de un estado de lead resuelto desde el catálogo `lead-statuses`
 * cargado al boot; fallback al `name` crudo para filas con estados que ya
 * no existen en el catálogo.
 */
export function leadStatusLabel(name: string, statusLabels: Map<string, string>): string {
  return statusLabels.get(name) ?? name;
}

export function mapLead(
  lead: ApiLead,
  agentNames: Map<string, string>,
  statusLabels: Map<string, string>,
): ChatLead {
  return {
    id: lead.id,
    personId: lead.person.id,
    phone: toUiPhone(lead.person.phone),
    agent: (lead.assignedAgentId && agentNames.get(lead.assignedAgentId)) || 'Sin asignar',
    firstMessageDate: lead.firstMessageAt ?? lead.createdAt,
    origin: lead.origin === 'paid' ? 'Facebook' : 'Orgánico',
    responded: lead.responded,
    firstResponseMinutesNatural: lead.firstResponseMinutesNatural,
    firstResponseMinutesWork: lead.firstResponseMinutesWork,
    isConversationReal: true,
    classification: CLASSIFICATION_ES[lead.classification] ?? 'Otro',
    detectedVacante: lead.detectedVacancyType
      ? (VACANCY_TYPE_ES[lead.detectedVacancyType] ?? lead.detectedVacancyType)
      : 'Otro',
    statusName: lead.status,
    status: leadStatusLabel(lead.status, statusLabels),
    notes: lead.notes ?? '',
    lastContactDate: lead.firstMessageAt ?? lead.createdAt,
    inWorkHours: lead.inWorkHours ?? false,
    arrivalHour: lead.arrivalHour ?? 0,
    arrivalDay: lead.arrivalDay ?? 0,
    messages: [],
    matchedOperatorId: lead.operator?.empNo ?? null,
    matchedOperatorUuid: lead.operator?.id ?? null,
  };
}

export function mapOperator(op: ApiOperator): Operator {
  return {
    id: op.id,
    empNo: op.empNo,
    company: op.company,
    name: op.name,
    hireDate: op.hireDate ?? '',
    status: OPERATOR_STATUS_ES[op.status] ?? 'Activo',
    companyCell: '',
    personalCell: '',
    partnerCell: '',
    normalizedPhones: op.normalizedPhones,
  };
}

export function mapCampaign(
  campaign: ApiCampaign,
  agentNames: Map<string, string>,
): MarketingCampaign {
  return {
    id: campaign.id,
    campaignName: campaign.name,
    startDate: campaign.startDate ?? '',
    endDate: campaign.endDate ?? '',
    isoWeek: campaign.isoWeek ?? '',
    spend: Number(campaign.spend),
    currency: campaign.currency,
    leadsReported: campaign.leadsReported,
    targetAgent:
      (campaign.targetAgentId && agentNames.get(campaign.targetAgentId)) || '',
    type: campaign.modality ? (MODALITY_ES[campaign.modality] ?? 'Local') : 'Local',
    vacanteId: campaign.vacancyId ?? '',
    status: CAMPAIGN_STATUS_ES[campaign.status] ?? 'Activa',
    clicks: campaign.clicks ?? undefined,
    pauseRequested: campaign.pauseRequestedAt,
  };
}

export function mapFleet(fleet: ApiFleet): FleetData {
  return {
    id: fleet.id,
    company: fleet.company as FleetData['company'],
    tractosTotales: fleet.totalTractors,
    tractosEnServicio: fleet.tractorsInService,
    tractosSinOperador: fleet.tractorsWithoutOperator,
    serviciosActivos: fleet.activeServices,
  };
}

export function mapGoal(goal: ApiGoal): MonthlyGoal {
  return {
    id: goal.id,
    company: goal.company,
    vacanteType: goal.vacancyType,
    monthlyTarget: goal.target,
  };
}

export function mapVacancy(vacancy: ApiVacancy): JobVacancy {
  return {
    id: vacancy.id,
    type: (VACANCY_TYPE_ES[vacancy.type] ?? vacancy.type) as JobVacancy['type'],
    circuit: vacancy.circuit ?? '',
    modality: MODALITY_ES[vacancy.modality] ?? 'Local',
    company: vacancy.company as JobVacancy['company'],
    quota: vacancy.quota,
    status: VACANCY_STATUS_ES[vacancy.status] ?? 'Abierta',
  };
}

export function mapSchedule(schedule: ApiWorkSchedule): WorkScheduleSettings {
  return {
    id: schedule.id,
    workDays: schedule.workDays,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    timezone: schedule.timezone,
  };
}

// ── Mapeos UI → API (escrituras) ────────────────────────────────────────

export function vacancyToApi(vacancy: Omit<JobVacancy, 'id'>): Record<string, unknown> {
  return {
    type: VACANCY_TYPE_EN[vacancy.type] ?? vacancy.type.toLowerCase(),
    circuit: vacancy.circuit || null,
    modality: MODALITY_EN[vacancy.modality] ?? 'local',
    company: vacancy.company,
    quota: vacancy.quota,
    status: VACANCY_STATUS_EN[vacancy.status] ?? 'open',
  };
}

export function fleetToApi(fleet: Omit<FleetData, 'id'>): Record<string, unknown> {
  return {
    company: fleet.company,
    totalTractors: fleet.tractosTotales,
    tractorsInService: fleet.tractosEnServicio,
    tractorsWithoutOperator: fleet.tractosSinOperador,
    activeServices: fleet.serviciosActivos,
  };
}

export function goalToApi(goal: Omit<MonthlyGoal, 'id'>): Record<string, unknown> {
  return {
    company: goal.company,
    vacancyType: goal.vacanteType,
    target: goal.monthlyTarget,
  };
}

export function operatorToApiBulk(op: Operator): Record<string, unknown> {
  return {
    empNo: op.empNo,
    company: op.company,
    name: op.name,
    hireDate: op.hireDate || null,
    status: op.status === 'Proceso Baja' ? 'leaving' : 'active',
    normalizedPhones: op.normalizedPhones.filter((p) => /^\d{10}$/.test(p)),
  };
}

export function campaignToApiBulk(c: MarketingCampaign): Record<string, unknown> {
  return {
    name: c.campaignName,
    startDate: c.startDate || null,
    endDate: c.endDate || null,
    isoWeek: c.isoWeek || null,
    spend: c.spend,
    leadsReported: c.leadsReported,
    clicks: c.clicks ?? null,
    modality: MODALITY_EN[c.type] ?? null,
    status: c.status === 'Pausada' ? 'paused' : 'active',
  };
}
