/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser de bajas históricas (employee-terminations) desde las hojas «Bajas <Mes/Sem>» del
 * reporte semanal. Cada hoja tiene una fila de encabezado con columnas en orden distinto — se
 * resuelven por nombre, como el resto de los parsers del proyecto. Solo la hoja de enero trae
 * número de empleado; el resto solo nombre (el match a operador se decide en el backend).
 */

import * as XLSX from 'xlsx';

export const TERMINATION_SHEETS = [
  'Bajas Enero2026',
  'Bajas Feb2026',
  'Bajas Marzo2026',
  'Bajas Abril2026',
  'Bajas Mayo2026',
  'Bajas Junio2026',
  'Bajas Sem032026',
  'Bajas Sem042026',
];

export type TerminationType =
  | 'renuncia_voluntaria'
  | 'abandono_trabajo'
  | 'rescision_contrato'
  | 'pension_incapacidad';

export interface TerminationRow {
  employeeNameRaw: string;
  employeeNameNormalized: string;
  empNoRaw: string | null;
  circuit: string | null;
  hireDate: string | null;
  terminationDate: string;
  terminationType: TerminationType | null;
  terminationTypeRaw: string | null;
  terminationCategory: string | null;
  reasonShort: string | null;
  reasonDetail: string | null;
  comment: string | null;
  tenureDays: number | null;
  sourceSheet: string;
}

export interface ParsedTerminations {
  rows: TerminationRow[];
  sheetsFound: string[];
  sheetsMissing: string[];
}

const norm = (cell: unknown): string =>
  String(cell ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Nombre normalizado para la clave de dedupe/match: mayúsculas, espacios colapsados, sin acentos. */
const normalizeName = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

function colOf(header: unknown[], needles: string[]): number {
  return header.findIndex((c) => {
    const t = norm(c);
    return needles.some((n) => t.includes(n));
  });
}

/** Extrae `YYYY-MM-DD` de un Date de xlsx o una cadena `DD/MM/YYYY`. */
function parseDate(cell: unknown): string | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    return `${cell.getUTCFullYear()}-${String(cell.getUTCMonth() + 1).padStart(2, '0')}-${String(
      cell.getUTCDate(),
    ).padStart(2, '0')}`;
  }
  const m = String(cell ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Normaliza el tipo de baja a una de las 4 categorías conocidas (insensible a acento/mayúscula). */
function normalizeTerminationType(raw: string): TerminationType | null {
  const t = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (t.includes('renuncia voluntaria')) return 'renuncia_voluntaria';
  if (t.includes('abandono de trabajo')) return 'abandono_trabajo';
  if (t.includes('rescici') && t.includes('contrat')) return 'rescision_contrato';
  if (t.includes('pension') && t.includes('incapacidad')) return 'pension_incapacidad';
  return null;
}

function tenureDaysBetween(hireDate: string | null, terminationDate: string): number | null {
  if (!hireDate) return null;
  const start = new Date(hireDate).getTime();
  const end = new Date(terminationDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

interface ColMap {
  empNo: number;
  name: number;
  circuit: number;
  hireDate: number;
  terminationDate: number;
  terminationType: number;
  terminationCategory: number;
  reasonShort: number;
  reasonDetail: number;
  comment: number;
}

function columnsFrom(header: unknown[]): ColMap | null {
  const name = colOf(header, ['nombre interno']);
  const terminationDate = colOf(header, ['fecha baja']);
  if (name === -1 || terminationDate === -1) return null;
  return {
    empNo: colOf(header, ['num empleado']),
    name,
    circuit: colOf(header, ['circuito']),
    hireDate: colOf(header, ['fecha ingreso']),
    terminationDate,
    terminationType: colOf(header, ['nom motivo baja']),
    terminationCategory: colOf(header, ['clasificacion de baja', 'clasificacion de la baja']),
    reasonShort: colOf(header, ['bos']),
    reasonDetail: colOf(header, ['submotivo baja']),
    comment: colOf(header, ['comentario baja']),
  };
}

const cellText = (row: unknown[], idx: number): string | null => {
  if (idx === -1) return null;
  const v = row[idx];
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return String(v).trim();
};

export function parseTerminations(file: ArrayBuffer): ParsedTerminations {
  const workbook = XLSX.read(new Uint8Array(file), { type: 'array', cellDates: true });

  const rows: TerminationRow[] = [];
  const sheetsFound: string[] = [];
  const sheetsMissing: string[] = [];

  for (const sheetName of TERMINATION_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      sheetsMissing.push(sheetName);
      continue;
    }
    sheetsFound.push(sheetName);

    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (sheetRows.length === 0) continue;
    const cols = columnsFrom(sheetRows[0] as unknown[]);
    if (!cols) continue;

    for (const raw of sheetRows.slice(1)) {
      const row = raw as unknown[];
      const nameRaw = cellText(row, cols.name);
      const terminationDate = parseDate(row[cols.terminationDate]);
      if (!nameRaw || !terminationDate) continue;

      const typeRaw = cellText(row, cols.terminationType);
      const hireDate = cols.hireDate !== -1 ? parseDate(row[cols.hireDate]) : null;

      rows.push({
        employeeNameRaw: nameRaw,
        employeeNameNormalized: normalizeName(nameRaw),
        empNoRaw: cellText(row, cols.empNo),
        circuit: cellText(row, cols.circuit),
        hireDate,
        terminationDate,
        terminationType: typeRaw ? normalizeTerminationType(typeRaw) : null,
        terminationTypeRaw: typeRaw,
        terminationCategory: cellText(row, cols.terminationCategory),
        reasonShort: cellText(row, cols.reasonShort),
        reasonDetail: cellText(row, cols.reasonDetail),
        comment: cellText(row, cols.comment),
        tenureDays: tenureDaysBetween(hireDate, terminationDate),
        sourceSheet: sheetName,
      });
    }
  }

  return { rows, sheetsFound, sheetsMissing };
}
