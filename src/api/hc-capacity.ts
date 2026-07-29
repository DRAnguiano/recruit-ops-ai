/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser del snapshot de capacidad por circuito (operational-capacity) desde la
 * hoja «HC 2026» del reporte semanal. La hoja tiene varios bloques (uno por
 * fecha); se toma el de fecha más reciente. Cada bloque: fila «Fecha», luego un
 * encabezado con «CIRCUITO», N filas de circuito y una fila «TOTAL» (ignorada).
 */

import * as XLSX from 'xlsx';
import { FileParseError } from '../utils/fileParsers';

export interface CircuitCapacityRow {
  circuit: string;
  units: number;
  unitsInMaintenance: number;
  unitsActive: number;
  hcAuthorized: number;
  hcReal: number;
  deficit: number;
  /** DIF crudo del reporte, cuando la columna existe; null si el bloque no la trae. */
  sourceDeficit: number | null;
}

export interface ParsedHcCapacity {
  snapshotDate: string | null;
  circuits: CircuitCapacityRow[];
  errors: FileParseError[];
}

const HC_SHEET = 'HC 2026';

function toNumber(cell: unknown): number {
  const n = typeof cell === 'number' ? cell : Number(String(cell ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Extrae una fecha (Date de xlsx o «... DD/MM/YYYY») a `YYYY-MM-DD`. */
function parseDate(cell: unknown): string | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    return `${cell.getUTCFullYear()}-${String(cell.getUTCMonth() + 1).padStart(2, '0')}-${String(
      cell.getUTCDate(),
    ).padStart(2, '0')}`;
  }
  const m = String(cell ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

const norm = (cell: unknown): string =>
  String(cell ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Índice de la 1ª celda cuyo texto normalizado contiene alguna subcadena. */
function colOf(header: unknown[], needles: string[]): number {
  return header.findIndex((c) => {
    const t = norm(c);
    return needles.some((n) => t.includes(n));
  });
}

/**
 * Mapa de columnas de un bloque. `circuit` y los HC se resuelven por nombre
 * (robusto ante la columna A vacía que XLSX omite/desfasa); `active` no tiene
 * encabezado propio (va entre `mtto` y el primer «aut»), así que se toma como
 * `mtto + 1`, o se calcula `units − mtto` si esa celda no es numérica.
 */
interface ColMap {
  circuit: number;
  units: number;
  mtto: number;
  active: number;
  hcAuthorized: number;
  hcReal: number;
  /** Columna «DIF» del reporte, cuando existe; -1 si el bloque no la trae. */
  sourceDeficit: number;
}
function columnsFrom(header: unknown[]): ColMap | null {
  const circuit = colOf(header, ['circuito']);
  const hcAuthorized = colOf(header, ['total aut']);
  const hcReal = colOf(header, ['total hc real', 'total real']);
  if (circuit === -1 || hcAuthorized === -1 || hcReal === -1) return null;
  const mtto = colOf(header, ['mtto']);
  return {
    circuit,
    units: colOf(header, ['# unidades', 'unidades']),
    mtto,
    active: mtto !== -1 ? mtto + 1 : -1,
    hcAuthorized,
    hcReal,
    sourceDeficit: colOf(header, ['dif']),
  };
}

export async function parseHcCapacity(file: File): Promise<ParsedHcCapacity> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

  const sheet =
    workbook.Sheets[HC_SHEET] ??
    workbook.Sheets[workbook.SheetNames.find((n) => n.toLowerCase().includes('hc 2026')) ?? ''];
  if (!sheet) {
    return { snapshotDate: null, circuits: [], errors: [{ fileName: file.name, message: `No se encontró la hoja «${HC_SHEET}».` }] };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });

  // Recorre los bloques; conserva el de fecha máxima.
  let bestDate: string | null = null;
  let bestCircuits: CircuitCapacityRow[] = [];
  let currentDate: string | null = null;
  let cols: ColMap | null = null;
  let currentCircuits: CircuitCapacityRow[] = [];

  const flush = () => {
    if (currentCircuits.length > 0 && (!bestDate || (currentDate && currentDate >= bestDate))) {
      bestDate = currentDate;
      bestCircuits = currentCircuits;
    }
  };

  for (const raw of rows) {
    const row = raw as unknown[];
    // La etiqueta puede caer en la col 0 o 1 según XLSX omita o no la col A vacía.
    const label = norm(row[0]) || norm(row[1]);

    if (label === 'fecha') {
      flush();
      currentDate = parseDate(row[0] === '' || row[0] == null ? row[2] : row[1]);
      cols = null;
      currentCircuits = [];
      continue;
    }
    // Encabezado del bloque: resuelve las columnas por nombre.
    if (label.startsWith('circuito')) {
      cols = columnsFrom(row);
      continue;
    }
    if (!cols) continue;
    if (label === 'total' || label === '') {
      cols = null;
      continue;
    }

    const circuit = String(row[cols.circuit] ?? '').trim();
    if (!circuit) continue;
    const hcAuthorized = toNumber(row[cols.hcAuthorized]);
    const hcReal = toNumber(row[cols.hcReal]);
    const units = cols.units !== -1 ? toNumber(row[cols.units]) : 0;
    const mtto = cols.mtto !== -1 ? toNumber(row[cols.mtto]) : 0;
    let active = cols.active !== -1 ? toNumber(row[cols.active]) : 0;
    if (active === 0 && units > 0) active = Math.max(0, units - mtto);
    const sourceDeficit =
      cols.sourceDeficit !== -1 && row[cols.sourceDeficit] != null && row[cols.sourceDeficit] !== ''
        ? toNumber(row[cols.sourceDeficit])
        : null;
    currentCircuits.push({
      circuit,
      units,
      unitsInMaintenance: mtto,
      unitsActive: active,
      hcAuthorized,
      hcReal,
      deficit: hcAuthorized - hcReal,
      sourceDeficit,
    });
  }
  flush();

  return {
    snapshotDate: bestDate,
    circuits: bestCircuits,
    errors:
      bestCircuits.length === 0
        ? [{ fileName: file.name, message: 'No se pudieron leer circuitos de la hoja HC 2026.' }]
        : [],
  };
}
