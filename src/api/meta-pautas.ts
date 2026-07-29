/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser de pautas de Meta Ads (meta-pautas-import): el export trae una hoja
 * por reclutadora, con encabezados heterogéneos y encoding roto (`campaÃ±a`).
 * Se resuelven las columnas por subcadena normalizada (sin acentos ni
 * mojibake), no por nombre exacto ni posición. La reclutadora se deriva del
 * nombre de la hoja (`Redes-Grupotm-Gladis` → «Gladis»), con el alias
 * `Dulce→Damaris` del import de historial.
 */

import * as XLSX from 'xlsx';
import { FileParseError } from '../utils/fileParsers';
import { agentFromFolderName } from './whatsapp-history';

export interface PautaCampaign {
  agent: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  spend: number;
  leadsReported: number;
}

export interface ParsedMetaPautas {
  campaigns: PautaCampaign[];
  errors: FileParseError[];
}

/** Minúsculas, sin acentos, colapsando el mojibake típico (Ã±→n, Ã©→e, …). */
function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ã±/g, 'n')
    .replace(/ã¡|ã /g, 'a')
    .replace(/ã©/g, 'e')
    .replace(/ã­/g, 'i')
    .replace(/ã³/g, 'o')
    .replace(/ãº/g, 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Índice de la primera columna cuyo encabezado normalizado contiene alguna subcadena. */
function findColumn(headers: string[], needles: string[]): number {
  return headers.findIndex((h) => needles.some((n) => h.includes(n)));
}

const MONTHS =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';

/**
 * «Redes-Grupotm-Junio julioHernan» → «Hernan». Los nombres de hoja anteponen
 * uno o más meses (a veces pegados sin espacio: «julioHernan»); se retiran
 * iterativamente del inicio hasta quedarse con el nombre de la reclutadora.
 */
function agentFromSheetName(sheet: string): string {
  let s = sheet.replace(/^redes[-\s]*grupotm[-\s]*/i, '').trim();
  const monthPrefix = new RegExp(`^(?:${MONTHS})[\\s]*`, 'i');
  // Cada pasada quita un mes al inicio (con o sin espacio tras él).
  for (let guard = 0; guard < 6 && monthPrefix.test(s); guard++) {
    s = s.replace(monthPrefix, '').trim();
  }
  return agentFromFolderName(s);
}

/** Convierte una celda de fecha (Date de xlsx o string) a `YYYY-MM-DD`. */
function toISODate(cell: unknown): string | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    return `${cell.getUTCFullYear()}-${String(cell.getUTCMonth() + 1).padStart(2, '0')}-${String(
      cell.getUTCDate(),
    ).padStart(2, '0')}`;
  }
  if (typeof cell === 'string') {
    const d = new Date(cell);
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`;
    }
  }
  return null;
}

function toNumber(cell: unknown): number {
  const n = typeof cell === 'number' ? cell : Number(String(cell ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function parseMetaPautas(file: File): Promise<ParsedMetaPautas> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

  const campaigns: PautaCampaign[] = [];
  const errors: FileParseError[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (matrix.length < 2) continue;

    const headers = (matrix[0] as unknown[]).map(normalizeHeader);
    const col = {
      name: findColumn(headers, ['nombre del anuncio', 'nombre de la camp']),
      start: findColumn(headers, ['inicio del informe']),
      end: findColumn(headers, ['fin del informe']),
      spend: findColumn(headers, ['importe gastado']),
      leads: findColumn(headers, ['contactos de mensajes tot', 'nuevos contactos de mensajes']),
    };

    if (col.name === -1) {
      errors.push({ fileName: `${file.name} · ${sheetName}`, message: 'Sin columna de nombre de campaña; hoja omitida.' });
      continue;
    }

    const agent = agentFromSheetName(sheetName);

    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r] as unknown[];
      const name = String(row[col.name] ?? '').trim();
      if (!name) continue; // fila vacía o de totales

      campaigns.push({
        agent,
        name,
        startDate: col.start !== -1 ? toISODate(row[col.start]) : null,
        endDate: col.end !== -1 ? toISODate(row[col.end]) : null,
        spend: col.spend !== -1 ? toNumber(row[col.spend]) : 0,
        leadsReported: col.leads !== -1 ? Math.round(toNumber(row[col.leads])) : 0,
      });
    }
  }

  return { campaigns, errors };
}
