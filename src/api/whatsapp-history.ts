/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Adaptador de historial de WhatsApp (whatsapp-history-import): convierte un
 * `ChatLead` ya parseado por `parseWhatsAppChat` en el lote que espera
 * `POST /api/import/whatsapp-history`, y resuelve la reclutadora desde el
 * nombre de la carpeta del export (con el alias Dulce→Damaris).
 */

import JSZip from 'jszip';
import { ChatLead, WorkScheduleSettings } from '../types';
import { parseWhatsAppChat } from '../utils/whatsappParser';

/** Alias de reclutadoras: mismo humano, distinto nombre en los exports. */
/**
 * Alias de reclutadoras: misma persona, distinta grafía entre fuentes.
 * Canónico = el nombre de los chats (ya presente en los leads cargados):
 *  - `dulce` (pautas de Meta) → «Damaris» (indicación del negocio).
 *  - `gladis` (pautas de Meta) → «Gladys» (chats), para que el cruce
 *    campaña↔lead por agente coincida.
 */
const AGENT_ALIASES: Record<string, string> = {
  dulce: 'Damaris',
  gladis: 'Gladys',
};

/** "Chats Hernan" → "Hernan"; "Chats Damaris (1)" → "Damaris" (aplica alias). */
export function agentFromFolderName(folderName: string): string {
  const stripped = folderName
    .replace(/^chats?\s+/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
  const alias = AGENT_ALIASES[stripped.toLowerCase()];
  return alias ?? stripped;
}

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Hash corto no criptográfico (FNV-ish), solo para desambiguar ids, no seguridad. */
function shortHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export interface ParsedWhatsAppHistory {
  agent: string;
  chatLeads: ChatLead[];
  /** Conversaciones dentro del zip que no produjeron candidato (solo el agente, o vacías). */
  skipped: number;
}

/**
 * Descomprime el export anidado de una reclutadora: el zip raíz contiene un
 * `.zip` por conversación, cada uno con un `.txt` en formato WhatsApp
 * (Android/iOS, español). La agente se deriva del nombre del archivo raíz
 * (`Chats Hernan.zip` → `Hernan`); nunca se descargan binarios de media.
 */
export async function parseWhatsAppHistory(
  file: File,
  settings: WorkScheduleSettings,
): Promise<ParsedWhatsAppHistory> {
  const agent = agentFromFolderName(file.name.replace(/\.zip$/i, ''));
  const root = await JSZip.loadAsync(file);

  const conversationEntries = Object.values(root.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.zip'),
  );

  const chatLeads: ChatLead[] = [];
  let skipped = 0;

  for (const entry of conversationEntries) {
    const buffer = await entry.async('arraybuffer');
    const conversationZip = await JSZip.loadAsync(buffer);
    const txtEntry = Object.values(conversationZip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.txt'),
    );
    if (!txtEntry) {
      skipped += 1;
      continue;
    }
    const text = await txtEntry.async('text');
    const chatLead = parseWhatsAppChat(text, agent, settings);
    if (!chatLead) {
      skipped += 1;
      continue;
    }
    chatLeads.push(chatLead);
  }

  return { agent, chatLeads, skipped };
}

export interface HistoricalMessage {
  externalMessageId: string;
  externalUserId: string;
  phoneE164?: string;
  body?: string;
  sentAt: string;
  referral?: { sourceId: string; sourceType?: string };
}

/**
 * Solo los mensajes ENTRANTES del candidato se ingieren (los del agente ya
 * definen `firstResponseMinutes*` dentro del propio `ChatLead`, pero no son
 * mensajes a persistir como inbound). `externalMessageId` es determinista
 * (teléfono + epoch + hash del texto): reimportar el mismo chat no duplica.
 *
 * Origen: si el heurístico del parser detectó "Facebook", se adjunta un
 * `referral` sintético y **claramente rotulado** como inferencia de texto
 * (nunca un ad_id real) — el pipeline lo usa solo para marcar
 * `origin='paid'`; nunca calza con una campaña real (los ad_id de Meta son
 * siempre numéricos), así que jamás se atribuye a una campaña inventada.
 */
export function chatLeadToInbound(chatLead: ChatLead): HistoricalMessage[] {
  // Sin texto (sticker, reacción, multimedia sin caption que el export no
  // trae) no es un mensaje de texto ingerible — mismo criterio que los
  // adaptadores en vivo, que solo clasifican `kind='text'` con body real.
  const candidateMessages = chatLead.messages.filter((m) => !m.isAgent && m.text.trim().length > 0);
  if (candidateMessages.length === 0) return [];

  const digits = digitsOf(candidateMessages[0].sender);
  if (!digits) return [];
  const phoneE164 = `+${digits}`;

  const referral: HistoricalMessage['referral'] | undefined =
    chatLead.origin === 'Facebook'
      ? { sourceId: 'historic-heuristic:facebook-text', sourceType: 'legacy_import_heuristic' }
      : undefined;

  return candidateMessages.map((m, idx) => {
    const epochSeconds = Math.floor(new Date(m.timestamp).getTime() / 1000);
    return {
      externalMessageId: `wa-hist:${digits}:${epochSeconds}:${shortHash(m.text)}`,
      externalUserId: digits,
      phoneE164,
      body: m.text,
      sentAt: m.timestamp,
      ...(idx === 0 && referral ? { referral } : {}),
    };
  });
}
