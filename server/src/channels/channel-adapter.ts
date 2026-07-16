export type ChannelName = 'whatsapp' | 'telegram' | 'messenger' | 'instagram';

/** Atribución de anuncio Click-to-WhatsApp (objeto `referral` de la Cloud API). */
export interface InboundReferral {
  /** Id del anuncio/post de origen (cruza con campaigns.external_id). */
  sourceId: string;
  sourceUrl?: string;
  sourceType?: string;
  ctwaClid?: string;
}

export type MessageKind = 'text' | 'audio' | 'image' | 'document' | 'video';

/** Referencia de media extraída por el adaptador — NUNCA el binario. */
export interface InboundMediaRef {
  /** Id del binario en el canal (media id de WhatsApp, file_id de Telegram). */
  externalId: string;
  mimeType?: string;
  filename?: string;
}

/**
 * Mensaje entrante normalizado: el único formato que la ingestión entiende,
 * venga del canal que venga.
 */
export interface NormalizedInboundMessage {
  channel: ChannelName;
  kind: MessageKind;
  /** Presente cuando kind ≠ text. */
  media?: InboundMediaRef;
  /** Id del mensaje en el canal (wamid, chatId_messageId, ...). */
  externalMessageId: string;
  /** Identidad del remitente en el canal (wa_id, chat id, PSID). */
  externalUserId: string;
  senderName?: string;
  /** Teléfono E.164 (+52...) cuando el canal lo expone. */
  phoneE164?: string;
  body?: string;
  /** Timestamp del mensaje según el canal, en UTC. */
  sentAt: Date;
  /** Presente cuando el mensaje llega desde un anuncio (Click-to-WhatsApp). */
  referral?: InboundReferral;
  /** Fragmento crudo del payload, intacto, para auditoría y reprocesos. */
  raw: Record<string, unknown>;
}

/**
 * Contrato de normalización por canal. Los adaptadores son PUROS (sin I/O):
 * un payload de webhook produce 0..N mensajes; lo no procesable (statuses,
 * edits, tipos no soportados) produce lista vacía, nunca una excepción.
 */
export interface ChannelAdapter {
  readonly channel: ChannelName;
  parse(raw: unknown): NormalizedInboundMessage[];
}
