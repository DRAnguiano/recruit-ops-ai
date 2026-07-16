/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatLead, Operator, MarketingCampaign, FleetData, MonthlyGoal, JobVacancy, WorkScheduleSettings } from '../types';

export const DEFAULT_VACANCIES: JobVacancy[] = [
  {
    id: 'vac_sencillo_torreon',
    type: 'Sencillo',
    circuit: 'Tramo Torreón',
    modality: 'Local',
    company: 'Transmontes',
    quota: 10,
    status: 'Abierta',
  },
  {
    id: 'vac_full_mty',
    type: 'Full',
    circuit: 'Ruta Monterrey-Saltillo',
    modality: 'Foráneo',
    company: 'TM Transportation',
    quota: 8,
    status: 'Abierta',
  },
  {
    id: 'vac_5ta_laredo',
    type: '5ta Rueda',
    circuit: 'Naredo Laredo',
    modality: 'Foráneo',
    company: 'TM Transfer',
    quota: 12,
    status: 'Abierta',
  },
  {
    id: 'vac_escuelita_gp',
    type: 'Escuelita',
    circuit: 'Academia Gómez Palacio',
    modality: 'Local',
    company: 'Transmontes',
    quota: 6,
    status: 'Abierta',
  },
];

export const DEFAULT_FLEET: FleetData[] = [
  {
    company: 'Transmontes',
    tractosTotales: 150,
    tractosEnServicio: 135,
    tractosSinOperador: 15,
    serviciosActivos: 120,
  },
  {
    company: 'TM Transportation',
    tractosTotales: 100,
    tractosEnServicio: 92,
    tractosSinOperador: 8,
    serviciosActivos: 85,
  },
  {
    company: 'TM Transfer',
    tractosTotales: 80,
    tractosEnServicio: 72,
    tractosSinOperador: 10,
    serviciosActivos: 60,
  },
];

export const DEFAULT_GOALS: MonthlyGoal[] = [
  { id: 'tm_sencillo', company: 'Transmontes', vacanteType: 'Sencillo', monthlyTarget: 12 },
  { id: 'tm_escuelita', company: 'Transmontes', vacanteType: 'Escuelita', monthlyTarget: 6 },
  { id: 'tmt_full', company: 'TM Transportation', vacanteType: 'Full', monthlyTarget: 8 },
  { id: 'tmx_5tarueda', company: 'TM Transfer', vacanteType: '5ta Rueda', monthlyTarget: 10 },
];

export const DEFAULT_SETTINGS: WorkScheduleSettings = {
  workDays: [1, 2, 3, 4, 5], // L-V
  startTime: '07:45',
  endTime: '17:10',
  timezone: 'America/Mexico_City',
};

// Generar operadores iniciales
export const DEFAULT_OPERATORS: Operator[] = [
  {
    empNo: 'OP-1024',
    company: 'Transmontes',
    name: 'José Refugio Torres',
    hireDate: '2026-07-10',
    status: 'Activo',
    companyCell: '8717894512',
    personalCell: '8715201436',
    partnerCell: '8719988776',
    normalizedPhones: ['8717894512', '8715201436', '8719988776'],
  },
  {
    empNo: 'OP-1025',
    company: 'TM Transportation',
    name: 'Manuel Alejandro Gómez',
    hireDate: '2026-07-12',
    status: 'Activo',
    companyCell: '8115664422',
    personalCell: '8119001122',
    partnerCell: '',
    normalizedPhones: ['8115664422', '8119001122'],
  },
  {
    empNo: 'OP-1026',
    company: 'TM Transfer',
    name: 'Carlos Francisco Salazar',
    hireDate: '2026-07-05',
    status: 'Activo',
    companyCell: '8671112233',
    personalCell: '8674445566',
    partnerCell: '8677778899',
    normalizedPhones: ['8671112233', '8674445566', '8677778899'],
  },
  {
    empNo: 'OP-1027',
    company: 'Transmontes',
    name: 'Jesús Humberto Martínez',
    hireDate: '2026-06-25',
    status: 'Activo',
    companyCell: '8714440099',
    personalCell: '',
    partnerCell: '',
    normalizedPhones: ['8714440099'],
  },
];

// Generar campañas de marketing iniciales
export const DEFAULT_CAMPAIGNS: MarketingCampaign[] = [
  {
    id: 'camp_sencillo_torreon_w28',
    campaignName: 'FB_Sencillo_Torreon_Julio',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    isoWeek: '2026-W28',
    spend: 8500,
    leadsReported: 45,
    targetAgent: 'Adriana',
    type: 'Local',
    vacanteId: 'vac_sencillo_torreon',
    status: 'Activa',
    clicks: 450,
  },
  {
    id: 'camp_full_mty_w28',
    campaignName: 'FB_Doble_Articulado_MTY',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    isoWeek: '2026-W28',
    spend: 12000,
    leadsReported: 38,
    targetAgent: 'Damaris',
    type: 'Foráneo',
    vacanteId: 'vac_full_mty',
    status: 'Activa',
    clicks: 390,
  },
  {
    id: 'camp_escuelita_w28',
    campaignName: 'FB_Escuelita_Capacitacion_TM',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    isoWeek: '2026-W28',
    spend: 4500,
    leadsReported: 25,
    targetAgent: 'Hernán',
    type: 'Local',
    vacanteId: 'vac_escuelita_gp',
    status: 'Pausada',
    clicks: 220,
    pauseRequested: '2026-07-11T16:30:00Z',
  },
  {
    id: 'camp_5ta_laredo_w28',
    campaignName: 'FB_Tráiler_5ta_Laredo_Transfer',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    isoWeek: '2026-W28',
    spend: 15000,
    leadsReported: 60,
    targetAgent: 'Gladys',
    type: 'Foráneo',
    vacanteId: 'vac_5ta_laredo',
    status: 'Activa',
    clicks: 720,
  }
];

// Generar chats iniciales con marcas de tiempo dentro y fuera de jornada
// lunes de julio de 2026: 06 (Lunes) a 12 (Domingo)
export const DEFAULT_LEADS: ChatLead[] = [
  {
    phone: '8715201436', // Vinculará con OP-1024
    agent: 'Adriana',
    firstMessageDate: '2026-07-06T08:00:00.000Z', // Lunes 8:00 AM (Dentro)
    origin: 'Facebook',
    responded: true,
    firstResponseMinutesNatural: 15,
    firstResponseMinutesWork: 15,
    isConversationReal: true,
    classification: 'Vacante',
    detectedVacante: 'Sencillo',
    status: 'Contratado',
    notes: 'Excelente candidato. Cuenta con licencia federal vigente.',
    lastContactDate: '2026-07-06T09:30:00.000Z',
    inWorkHours: true,
    arrivalHour: 8,
    arrivalDay: 1,
    messages: [
      { timestamp: '2026-07-06T08:00:00.000Z', sender: '+52 871 520 1436', text: '¡Hola! Quiero más información sobre la vacante de Sencillo en Torreón.', isAgent: false },
      { timestamp: '2026-07-06T08:15:00.000Z', sender: 'Adriana Reclutamiento', text: 'Hola, buenos días. Claro que sí, con gusto te doy detalles. ¿Qué experiencia tienes con sencillos?', isAgent: true },
      { timestamp: '2026-07-06T08:22:00.000Z', sender: '+52 871 520 1436', text: 'Tengo 3 años de experiencia manejando torton y camion de 10 toneladas local y foraneo.', isAgent: false },
      { timestamp: '2026-07-06T08:30:00.000Z', sender: 'Adriana Reclutamiento', text: 'Perfecto, nos interesa. ¿Me puedes enviar foto de tu licencia federal vigente por favor?', isAgent: true },
    ],
    matchedOperatorId: 'OP-1024',
  },
  {
    phone: '8119001122', // Vinculará con OP-1025
    agent: 'Damaris',
    firstMessageDate: '2026-07-06T23:00:00.000Z', // Lunes 11:00 PM (Fuera)
    origin: 'Facebook',
    responded: true,
    firstResponseMinutesNatural: 540, // 9 horas (respondió martes 8:00 am)
    firstResponseMinutesWork: 15, // 15 minutos hábiles (de 7:45 am a 8:00 am del martes)
    isConversationReal: true,
    classification: 'Vacante',
    detectedVacante: 'Full',
    status: 'Contratado',
    notes: 'Operador con amplia experiencia en doble remolque. Trae toda su papelería.',
    lastContactDate: '2026-07-07T12:00:00.000Z',
    inWorkHours: false,
    arrivalHour: 23,
    arrivalDay: 1,
    messages: [
      { timestamp: '2026-07-06T23:00:00.000Z', sender: '+52 81 1900 1122', text: 'Hola. ¡Más información sobre la vacante de operador Full!', isAgent: false },
      { timestamp: '2026-07-07T08:00:00.000Z', sender: 'Damaris Reclutamiento', text: 'Hola buen día. Con mucho gusto. Contamos con circuito Monterrey. ¿Tienes licencia tipo E vigente?', isAgent: true },
      { timestamp: '2026-07-07T08:15:00.000Z', sender: '+52 81 1900 1122', text: 'Hola, sí claro, cuento con la E vigente y apto médico.', isAgent: false },
    ],
    matchedOperatorId: 'OP-1025',
  },
  {
    phone: '8674445566', // Vinculará con OP-1026
    agent: 'Gladys',
    firstMessageDate: '2026-07-07T10:15:00.000Z', // Martes 10:15 AM (Dentro)
    origin: 'Facebook',
    responded: true,
    firstResponseMinutesNatural: 8,
    firstResponseMinutesWork: 8,
    isConversationReal: true,
    classification: 'Vacante',
    detectedVacante: '5ta Rueda',
    status: 'Contratado',
    notes: 'Para ruta Laredo. Experiencia en cruces fronterizos.',
    lastContactDate: '2026-07-07T10:40:00.000Z',
    inWorkHours: true,
    arrivalHour: 10,
    arrivalDay: 2,
    messages: [
      { timestamp: '2026-07-07T10:15:00.000Z', sender: '+52 867 444 5566', text: 'Quiero más información de la vacante quinta rueda transfer.', isAgent: false },
      { timestamp: '2026-07-07T10:23:00.000Z', sender: 'Gladys Reclutamiento', text: 'Hola! Con gusto. ¿Vives en Nuevo Laredo? ¿Tienes visa láser?', isAgent: true },
      { timestamp: '2026-07-07T10:28:00.000Z', sender: '+52 867 444 5566', text: 'Sí vivo aquí en Laredo y tengo visa láser vigente y Fast.', isAgent: false },
    ],
    matchedOperatorId: 'OP-1026',
  },
  {
    phone: '8719999991',
    agent: 'Adriana',
    firstMessageDate: '2026-07-08T19:30:00.000Z', // Miércoles 7:30 PM (Fuera)
    origin: 'Facebook',
    responded: true,
    firstResponseMinutesNatural: 750, // Respondió Jueves 8:00 am
    firstResponseMinutesWork: 15, // de 7:45 am a 8:00 am
    isConversationReal: true,
    classification: 'Vacante',
    detectedVacante: 'Sencillo',
    status: 'En proceso',
    notes: 'Pendiente de examen médico.',
    lastContactDate: '2026-07-09T08:00:00.000Z',
    inWorkHours: false,
    arrivalHour: 19,
    arrivalDay: 3,
    messages: [
      { timestamp: '2026-07-08T19:30:00.000Z', sender: '+52 871 999 9991', text: 'Me interesa la vacante de tramo local Torreón de sencillo.', isAgent: false },
      { timestamp: '2026-07-09T08:00:00.000Z', sender: 'Adriana Reclutamiento', text: 'Hola, buen día. ¿Me podrías indicar tu experiencia?', isAgent: true },
      { timestamp: '2026-07-09T08:15:00.000Z', sender: '+52 871 999 9991', text: 'Manejé tracto con caja seca por 2 años en otra empresa regional.', isAgent: false },
    ],
    matchedOperatorId: null,
  },
  {
    phone: '8718888882',
    agent: 'Adriana',
    firstMessageDate: '2026-07-09T14:00:00.000Z', // Jueves 2:00 PM (Dentro)
    origin: 'Orgánico',
    responded: true,
    firstResponseMinutesNatural: 10,
    firstResponseMinutesWork: 10,
    isConversationReal: false,
    classification: 'RH Interno',
    detectedVacante: 'Otro',
    status: 'Descartado',
    notes: 'Es operador activo que quiere aclaración de su recibo de nómina e infonavit.',
    lastContactDate: '2026-07-09T14:15:00.000Z',
    inWorkHours: true,
    arrivalHour: 14,
    arrivalDay: 4,
    messages: [
      { timestamp: '2026-07-09T14:00:00.000Z', sender: '+52 871 888 8882', text: 'Hola, ¿con quién puedo ver por qué me descontaron tanto de Infonavit en mi nómina de esta semana?', isAgent: false },
      { timestamp: '2026-07-09T14:10:00.000Z', sender: 'Adriana Reclutamiento', text: 'Hola. Disculpa, este número es exclusivo de Reclutamiento. Te comparto el contacto de Nóminas para que te apoyen: 871-XXX-XXXX.', isAgent: true },
    ],
    matchedOperatorId: null,
  },
  {
    phone: '8711112223',
    agent: 'Hernán',
    firstMessageDate: '2026-07-10T11:00:00.000Z', // Viernes 11:00 AM (Dentro)
    origin: 'Facebook',
    responded: true,
    firstResponseMinutesNatural: 120, // 2 horas (respondió a la 1:00 PM)
    firstResponseMinutesWork: 120,
    isConversationReal: true,
    classification: 'Vacante',
    detectedVacante: 'Escuelita',
    status: 'En proceso',
    notes: 'Interesado en incorporarse a la Escuelita de formación de operadores.',
    lastContactDate: '2026-07-10T13:10:00.000Z',
    inWorkHours: true,
    arrivalHour: 11,
    arrivalDay: 5,
    messages: [
      { timestamp: '2026-07-10T11:00:00.000Z', sender: '+52 871 111 2223', text: 'Hola, vi el anuncio sobre la Escuelita para aprender a manejar tráiler.', isAgent: false },
      { timestamp: '2026-07-10T13:00:00.000Z', sender: 'Hernán Reclutamiento', text: 'Hola, buenas tardes. Excelente, nuestro programa está por iniciar. ¿Tienes licencia de chofer particular?', isAgent: true },
      { timestamp: '2026-07-10T13:10:00.000Z', sender: '+52 871 111 2223', text: 'Sí tengo licencia de chofer del estado de Coahuila y sé manejar de velocidades.', isAgent: false },
    ],
    matchedOperatorId: null,
  },
  {
    phone: '8714445556',
    agent: 'Damaris',
    firstMessageDate: '2026-07-11T20:00:00.000Z', // Sábado 8:00 PM (Fuera)
    origin: 'Facebook',
    responded: false, // Sin respuesta
    firstResponseMinutesNatural: null,
    firstResponseMinutesWork: null,
    isConversationReal: false,
    classification: 'Vacante',
    detectedVacante: 'Full',
    status: 'Sin respuesta',
    notes: 'No respondió al primer contacto automático el fin de semana.',
    lastContactDate: '2026-07-11T20:00:00.000Z',
    inWorkHours: false,
    arrivalHour: 20,
    arrivalDay: 6,
    messages: [
      { timestamp: '2026-07-11T20:00:00.000Z', sender: '+52 871 444 5556', text: '¡Hola! Quiero más información', isAgent: false },
    ],
    matchedOperatorId: null,
  }
];
