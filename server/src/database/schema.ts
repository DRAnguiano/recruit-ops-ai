import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

// Nota de diseño (design.md, decisión 3): los enums de negocio (estados,
// clasificaciones, tipos de vacante, canales) se guardan como text validado
// en la capa de dominio — NUNCA como enums de Postgres — para poder volverlos
// catálogos configurables desde UI sin migraciones destructivas.

export interface MessageMedia {
  externalId: string;
  mimeType?: string;
  filename?: string;
  status: 'pending' | 'stored' | 'failed';
  storageKey?: string;
  sizeBytes?: number;
  error?: string;
}

/** Estado de entrega de un mensaje saliente; los entrantes no lo llevan. */
export interface MessageDelivery {
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  /** Id del mensaje en el canal (wamid / message_id) una vez enviado. */
  externalId?: string;
  error?: string;
  updatedAt: string;
}

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Forma común de los catálogos de valores de dominio (configurable-catalogs):
 * `name` es el identificador que referencian las filas de negocio (inmutable
 * tras crear; se desactiva, no se renombra), `label` el texto de UI.
 * Factory porque los column builders de Drizzle no se comparten entre tablas.
 */
const catalogEntryColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  label: text('label').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const companies = pgTable('companies', catalogEntryColumns());
export const circuits = pgTable('circuits', catalogEntryColumns());
export const vacancyTypes = pgTable('vacancy_types', catalogEntryColumns());
export const leadStatuses = pgTable('lead_statuses', catalogEntryColumns());

/** Persona única, deduplicada por teléfono E.164. */
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Teléfono normalizado E.164 (+52...); llave de dedup entre canales. */
  phone: text('phone').unique(),
  name: text('name'),
  ...timestamps,
});

/** Identidad de una persona en un canal (wa_id, chat_id de Telegram, PSID de Messenger/IG). */
export const channelIdentities = pgTable(
  'channel_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    /** whatsapp | telegram | messenger | instagram */
    channel: text('channel').notNull(),
    externalId: text('external_id').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('channel_identities_channel_external_id').on(t.channel, t.externalId)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    channel: text('channel').notNull(),
    /** open | closed — ciclo de sistema; el estado de negocio vive en el lead. */
    status: text('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** human | bot — quién atiende la conversación ahora mismo. */
    attentionMode: text('attention_mode').notNull().default('human'),
    assignedAgentId: uuid('assigned_agent_id').references(() => agents.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('conversations_person_id').on(t.personId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    channel: text('channel').notNull(),
    /** Id del mensaje en el canal de origen; único por canal → ingestión idempotente. */
    externalMessageId: text('external_message_id').notNull(),
    /** inbound | outbound */
    direction: text('direction').notNull(),
    /** text | audio | image | document | video */
    type: text('type').notNull().default('text'),
    /**
     * Referencia de media 1:1 con el mensaje:
     * { externalId, mimeType?, filename?, status: pending|stored|failed,
     *   storageKey?, sizeBytes?, error? }
     */
    media: jsonb('media').$type<MessageMedia | null>(),
    /**
     * Solo outbound: { status: queued|sent|delivered|read|failed, externalId?,
     * error?, updatedAt }. Los estados solo avanzan (delivery-status spec).
     */
    delivery: jsonb('delivery').$type<MessageDelivery | null>(),
    sender: text('sender'),
    body: text('body'),
    /** Payload original del webhook, intacto, para reprocesos futuros. */
    rawPayload: jsonb('raw_payload'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('messages_channel_external_message_id').on(t.channel, t.externalMessageId),
    index('messages_conversation_id').on(t.conversationId),
  ],
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .unique()
      .references(() => people.id),
    /** vacancy | internal_hr | other */
    classification: text('classification').notNull().default('other'),
    detectedVacancyType: text('detected_vacancy_type'),
    /** new | in_progress | documents | hired | discarded | no_response */
    status: text('status').notNull().default('new'),
    /** Canal/campaña de origen; con referral de Meta la atribución es exacta. */
    origin: text('origin'),
    campaignId: uuid('campaign_id').references(() => campaigns.id),
    assignedAgentId: uuid('assigned_agent_id').references(() => agents.id),
    notes: text('notes'),
    firstMessageAt: timestamp('first_message_at', { withTimezone: true }),
    responded: boolean('responded').notNull().default(false),
    firstResponseMinutesNatural: integer('first_response_minutes_natural'),
    firstResponseMinutesWork: integer('first_response_minutes_work'),
    inWorkHours: boolean('in_work_hours'),
    /** Hora local (0-23) y día (0=domingo) de llegada, en la TZ del schedule. */
    arrivalHour: integer('arrival_hour'),
    arrivalDay: integer('arrival_day'),
    /** system | human — la corrección humana nunca es pisada por el pipeline. */
    classificationSource: text('classification_source').notNull().default('system'),
    /** Referral crudo de Click-to-WhatsApp cuando la campaña aún no existe localmente. */
    referralPayload: jsonb('referral_payload'),
    matchedOperatorId: uuid('matched_operator_id').references(() => operators.id),
    ...timestamps,
  },
  (t) => [index('leads_status').on(t.status)],
);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Id de la campaña en Meta Marketing API (null para CSV/manual). */
  externalId: text('external_id').unique(),
  name: text('name').notNull(),
  /** meta_api | csv | manual — de dónde vienen los datos de esta campaña. */
  source: text('source').notNull().default('manual'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isoWeek: text('iso_week'),
  spend: numeric('spend', { precision: 12, scale: 2 }).notNull().default('0'),
  /** ISO-4217; la moneda real la reporta la cuenta publicitaria (decisión §3.14). */
  currency: text('currency').notNull().default('USD'),
  leadsReported: integer('leads_reported').notNull().default(0),
  clicks: integer('clicks'),
  targetAgentId: uuid('target_agent_id').references(() => agents.id),
  /** local | foreign (Local/Foráneo en UI) */
  modality: text('modality'),
  vacancyId: uuid('vacancy_id').references(() => jobVacancies.id),
  /** active | paused */
  status: text('status').notNull().default('active'),
  pauseRequestedAt: timestamp('pause_requested_at', { withTimezone: true }),
  ...timestamps,
});

export const jobVacancies = pgTable('job_vacancies', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** sencillo | full | quinta_rueda | escuelita (catálogo configurable a futuro) */
  type: text('type').notNull(),
  /** Ruta/circuito, ej. "Tramo Torreón", "Clarios". */
  circuit: text('circuit'),
  /** local | foreign */
  modality: text('modality').notNull(),
  company: text('company').notNull(),
  quota: integer('quota').notNull().default(0),
  /** open | paused | closed */
  status: text('status').notNull().default('open'),
  ...timestamps,
});

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

export const operators = pgTable('operators', {
  id: uuid('id').primaryKey().defaultRandom(),
  empNo: text('emp_no').notNull().unique(),
  company: text('company').notNull(),
  name: text('name').notNull(),
  hireDate: date('hire_date'),
  /** active | leaving (Activo / Proceso Baja) */
  status: text('status').notNull().default('active'),
  /** Teléfonos normalizados (10 dígitos) para match lead→operador. */
  normalizedPhones: jsonb('normalized_phones').$type<string[]>().notNull().default([]),
  /** Qué se contrató (catálogo vacancy_types: full, sencillo, …). */
  operatorType: text('operator_type'),
  /** Circuito al que pertenece (catálogo circuits). */
  circuit: text('circuit'),
  ...timestamps,
});

export const fleet = pgTable('fleet', {
  id: uuid('id').primaryKey().defaultRandom(),
  company: text('company').notNull().unique(),
  totalTractors: integer('total_tractors').notNull().default(0),
  tractorsInService: integer('tractors_in_service').notNull().default(0),
  tractorsWithoutOperator: integer('tractors_without_operator').notNull().default(0),
  activeServices: integer('active_services').notNull().default(0),
  ...timestamps,
});

/**
 * Metas por periodo (configurable-catalogs): semanales o mensuales por
 * empresa + tipo de operador + circuito opcional. La unicidad usa
 * COALESCE(circuit,'') para que "sin circuito" también sea única.
 */
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** weekly | monthly */
    periodKind: text('period_kind').notNull().default('monthly'),
    company: text('company').notNull(),
    vacancyType: text('vacancy_type').notNull(),
    circuit: text('circuit'),
    target: integer('target').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('goals_period_company_type_circuit').on(
      t.periodKind,
      t.company,
      t.vacancyType,
      sql`COALESCE(${t.circuit}, '')`,
    ),
  ],
);

export const workSchedules = pgTable('work_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  /** Días laborables 0-6 (0=domingo). */
  workDays: jsonb('work_days').$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  /** "HH:MM" en la zona horaria del schedule. */
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  /** TZ IANA del schedule; los horarios SIEMPRE se evalúan contra ella. */
  timezone: text('timezone').notNull().default('America/Mexico_City'),
  ...timestamps,
});

/**
 * Reglas de clasificación como DATOS (regla 1: nada de negocio hardcodeado).
 * El motor las evalúa por prioridad ascendente con matching case/acento-insensible.
 */
export const classificationRules = pgTable('classification_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** ad_cta | internal_hr | vacancy_type */
  category: text('category').notNull(),
  /** Para vacancy_type: el tipo que detecta (sencillo, full, quinta_rueda, escuelita). */
  target: text('target'),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  priority: integer('priority').notNull().default(100),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

/**
 * Plantillas de mensaje aprobadas (message-templates spec): configuración,
 * nunca código. `body` usa placeholders {{1}}..{{n}} para previsualización;
 * el payload real de la Cloud API se construye en el backend al enviar.
 */
export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    language: text('language').notNull().default('es_MX'),
    /** whatsapp | telegram (Telegram no exige plantillas; se permiten como atajos). */
    channel: text('channel').notNull().default('whatsapp'),
    body: text('body').notNull(),
    variablesCount: integer('variables_count').notNull().default(0),
    /** approved | pending | rejected — refleja el estado en Meta (captura manual). */
    status: text('status').notNull().default('approved'),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('message_templates_name_language_channel').on(t.name, t.language, t.channel),
  ],
);

/** Configuración operativa simple clave→valor (ej. conversation_inactivity_days). */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Credenciales de canal cifradas (channel-credentials): los secretos por canal
 * salen de env a esta tabla. `secretsEncrypted` es base64(iv||tag||ciphertext)
 * del JSON de secretos, cifrado con AES-256-GCM y la llave maestra de env. El
 * índice único parcial impone una sola credencial activa por `kind` (el ruteo
 * multi-cuenta lo relaja en add-multi-account-routing).
 */
export const channelCredentials = pgTable(
  'channel_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** meta_app | whatsapp | meta_page | telegram */
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    active: boolean('active').notNull().default(true),
    /** base64(iv||authTag||ciphertext) del JSON de secretos; nunca en texto plano. */
    secretsEncrypted: text('secrets_encrypted').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('channel_credentials_active_kind')
      .on(t.kind)
      .where(sql`${t.active}`),
  ],
);

/**
 * Event log append-only: única fuente de métricas y auditoría.
 * UPDATE/DELETE son rechazados por trigger (migración custom).
 */
export const domainEvents = pgTable(
  'domain_events',
  {
    /** UUID v7 generado en la app → orden temporal en el propio id. */
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    type: text('type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    /** system | user | bot | channel */
    actor: text('actor').notNull(),
    payload: jsonb('payload').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('domain_events_type_occurred_at').on(t.type, t.occurredAt),
    index('domain_events_aggregate').on(t.aggregateType, t.aggregateId),
  ],
);
