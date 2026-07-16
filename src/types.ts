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

export interface ChatLead {
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
  status: 'Nuevo' | 'En proceso' | 'Documentos' | 'Contratado' | 'Descartado' | 'Sin respuesta';
  notes: string;
  lastContactDate: string; // ISO String of last message
  inWorkHours: boolean;
  arrivalHour: number; // 0-23
  arrivalDay: number; // 0-6 (0=Dom, 1=Lun...)
  messages: Message[];
  matchedOperatorId: string | null; // Matched employee number from directory
}

export interface Operator {
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
  spend: number; // gasto_mxn
  leadsReported: number; // leads_reportados
  targetAgent: string; // agente_destino
  type: 'Local' | 'Foráneo';
  vacanteId: string; // Reference to JobVacancy.id or type
  status: 'Activa' | 'Pausada';
  clicks?: number; // clicks (opcional)
  pauseRequested?: string | null; // ISO timestamp when requested
}

export interface FleetData {
  company: 'Transmontes' | 'TM Transportation' | 'TM Transfer';
  tractosTotales: number;
  tractosEnServicio: number;
  tractosSinOperador: number;
  serviciosActivos: number;
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
