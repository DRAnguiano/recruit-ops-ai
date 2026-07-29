/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Message {
  timestamp: string; // ISO String
  sender: string;
  text: string;
  isAgent: boolean;
}

/**
 * Entrada de un catálogo de dominio (empresas, circuitos, tipos de vacante,
 * estados de lead): add-configurable-catalogs. `name` es el identificador de
 * dominio (inmutable); `label` es el texto para UI.
 */
export interface CatalogEntry {
  id: string;
  name: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

/** Tipo de dato de un campo personalizado (add-custom-fields). */
export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'date';

/**
 * Definición de un campo personalizado de lead o persona
 * (add-custom-fields): `key` es el identificador de dominio (inmutable);
 * `options` solo aplica cuando `type === 'select'`.
 */
export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  required: boolean;
  active: boolean;
  sortOrder: number;
}

/**
 * Definición + valor actual (o null) de un campo personalizado para una
 * entidad concreta, tal como lo devuelve `GET .../custom-fields`.
 */
export interface FieldValue {
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  required: boolean;
  value: string | number | boolean | null;
  source: 'human' | 'ai' | null;
  evidenceText: string | null;
  evidenceMessageId: string | null;
}

export interface ChatLead {
  id?: string; // uuid del lead en el backend (migrate-spa-to-api)
  personId?: string; // uuid de la persona (para cargar sus conversaciones)
  matchedOperatorUuid?: string | null; // uuid del operador vinculado (API)
  phone: string; // Last 10 digits normalized
  agent: string; // Adriana, Damaris, Gladys, Hernán, etc.
  firstMessageDate: string; // ISO String
  origin: 'Facebook' | 'Orgánico';
  responded: boolean;
  firstResponseMinutesNatural: number | null;
  firstResponseMinutesWork: number | null;
  isConversationReal: boolean;
  classification: 'Vacante' | 'RH Interno' | 'Otro';
  detectedVacante: string; // e.g. Sencillo, Full, 5ta Rueda, Escuelita, Otro
  /** Nombre de dominio del estado (catálogo lead-statuses, ej. 'in_progress'). */
  statusName: string;
  /** Label del estado para UI, resuelto desde el catálogo. */
  status: string;
  notes: string;
  lastContactDate: string; // ISO String of last message
  inWorkHours: boolean;
  arrivalHour: number; // 0-23
  arrivalDay: number; // 0-6 (0=Dom, 1=Lun...)
  messages: Message[];
  matchedOperatorId: string | null; // Matched employee number from directory
}

export interface Operator {
  id?: string; // uuid en el backend
  empNo: string; // # Emp
  company: string; // Transmontes, TM Transportation, TM Transfer
  name: string;
  hireDate: string; // YYYY-MM-DD
  status: 'Activo' | 'Proceso Baja';
  companyCell: string; // raw
  personalCell: string; // raw
  partnerCell: string; // raw
  normalizedPhones: string[]; // 10-digit normalized phone numbers
}

export interface MarketingCampaign {
  id: string;
  campaignName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isoWeek: string; // YYYY-Www
  spend: number; // monto en `currency`
  currency?: string; // ISO-4217, default USD
  leadsReported: number; // leads_reportados
  targetAgent: string; // agente_destino
  type: 'Local' | 'Foráneo';
  vacanteId: string; // Reference to JobVacancy.id or type
  status: 'Activa' | 'Pausada';
  clicks?: number; // clicks (opcional)
  pauseRequested?: string | null; // ISO timestamp when requested
}

export interface FleetData {
  id?: string; // uuid en el backend
  company: 'Transmontes' | 'TM Transportation' | 'TM Transfer';
  tractosTotales: number;
  tractosEnServicio: number;
  tractosSinOperador: number;
  serviciosActivos: number;
}

/**
 * Snapshot de capacidad de dotación por circuito (add-operational-capacity):
 * HC autorizado vs. real → déficit, tal como lo devuelve `/api/circuit-capacity`.
 */
export interface CircuitCapacity {
  id: string;
  circuit: string;
  units: number;
  unitsInMaintenance: number;
  unitsActive: number;
  hcAuthorized: number;
  hcReal: number;
  deficit: number;
  snapshotDate: string | null;
}

export interface MonthlyGoal {
  id: string; // company + "_" + vacanteType
  company: string;
  vacanteType: string;
  monthlyTarget: number;
}

export interface JobVacancy {
  id: string;
  type: 'Sencillo' | 'Full' | '5ta Rueda' | 'Escuelita';
  circuit: string; // Ruta (ej. "Tramo Torreón", "Clarios")
  modality: 'Local' | 'Foráneo';
  company: 'Transmontes' | 'TM Transportation' | 'TM Transfer';
  quota: number; // Cupo
  status: 'Abierta' | 'Pausada' | 'Cerrada';
}

export interface WorkScheduleSettings {
  id?: string; // uuid del work_schedule en el backend
  workDays: number[]; // e.g. [1, 2, 3, 4, 5] (Monday to Friday)
  startTime: string; // "HH:MM" e.g. "07:45"
  endTime: string; // "HH:MM" e.g. "17:10"
  timezone: string; // default "America/Mexico_City"
}

export interface AppDatabaseBackup {
  leads: ChatLead[];
  operators: Operator[];
  campaigns: MarketingCampaign[];
  fleet: FleetData[];
  goals: MonthlyGoal[];
  vacancies: JobVacancy[];
  settings: WorkScheduleSettings;
}
