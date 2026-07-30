import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { operators, terminations } from '../database/schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DomainEventsService } from '../events/domain-events.service';
import {
  TerminationRowImport,
  TerminationsImport,
  terminationsImportSchema,
} from './terminations.schemas';

const pipe = new ZodValidationPipe(terminationsImportSchema);

export interface TerminationsImportResult {
  rowsReceived: number;
  created: number;
  duplicates: number;
  matchedByEmpNo: number;
  matchedByName: number;
  unmatched: number;
}

/** Mismo criterio de normalización que el parser del cliente (src/api/terminations.ts). */
const normalizeName = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

/**
 * Alias de nombre de circuito, normalizado en mayúsculas → nombre canónico (mismo criterio de
 * `circuit_capacity`). Las hojas de bajas usan variantes distintas del mismo circuito (ciudad en
 * vez de sigla, mayúsculas inconsistentes) — mismo tipo de alias que ya usa el proyecto para
 * nombres de reclutadora (AGENT_ALIASES en whatsapp-history).
 */
const CIRCUIT_ALIASES: Record<string, string> = {
  MONTERREY: 'MTY',
  TORREON: 'TRC',
  BAJIO: 'BAJIO FORANEOS',
  MARITIMO: 'MARITIMO FORANEOS',
};

/** Normaliza el nombre de circuito para agrupar (mayúsculas, espacios colapsados, alias conocidos). */
const normalizeCircuit = (raw: string): string => {
  const upper = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
  return CIRCUIT_ALIASES[upper] ?? upper;
};

/**
 * Bajas históricas (employee-terminations): import idempotente (dedupe por nombre normalizado +
 * fecha de baja) con vínculo opcional y nunca inventado a un operador vigente — por número de
 * empleado si el reporte lo trae, si no por nombre exacto normalizado, solo cuando es unívoco.
 */
@Controller()
export class TerminationsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
  ) {}

  @Post('import/terminations')
  async importTerminations(
    @Body(pipe) body: TerminationsImport,
  ): Promise<TerminationsImportResult> {
    const allOperators = await this.db
      .select({ id: operators.id, empNo: operators.empNo, name: operators.name })
      .from(operators);

    const byEmpNo = new Map(allOperators.map((o) => [o.empNo, o.id]));
    const byNormalizedName = new Map<string, string[]>();
    for (const o of allOperators) {
      const key = normalizeName(o.name);
      const arr = byNormalizedName.get(key) ?? [];
      arr.push(o.id);
      byNormalizedName.set(key, arr);
    }

    const resolveMatch = (
      row: TerminationRowImport,
    ): { operatorId: string | null; matchedBy: string | null } => {
      if (row.empNoRaw) {
        const byEmp = byEmpNo.get(row.empNoRaw);
        if (byEmp) return { operatorId: byEmp, matchedBy: 'emp_no' };
      }
      const candidates = byNormalizedName.get(row.employeeNameNormalized);
      if (candidates && candidates.length === 1) {
        return { operatorId: candidates[0]!, matchedBy: 'name' };
      }
      return { operatorId: null, matchedBy: null };
    };

    let created = 0;
    let matchedByEmpNo = 0;
    let matchedByName = 0;

    for (const row of body.rows) {
      const { operatorId, matchedBy } = resolveMatch(row);
      const inserted = await this.db
        .insert(terminations)
        .values({
          operatorId,
          matchedBy,
          employeeNameRaw: row.employeeNameRaw,
          employeeNameNormalized: row.employeeNameNormalized,
          empNoRaw: row.empNoRaw ?? null,
          circuit: row.circuit ?? null,
          hireDate: row.hireDate ?? null,
          terminationDate: row.terminationDate,
          terminationType: row.terminationType ?? null,
          terminationTypeRaw: row.terminationTypeRaw ?? null,
          terminationCategory: row.terminationCategory ?? null,
          reasonShort: row.reasonShort ?? null,
          reasonDetail: row.reasonDetail ?? null,
          comment: row.comment ?? null,
          tenureDays: row.tenureDays ?? null,
          sourceSheet: row.sourceSheet,
        })
        .onConflictDoNothing({
          target: [terminations.employeeNameNormalized, terminations.terminationDate],
        })
        .returning({ id: terminations.id });

      if (inserted[0]) {
        created += 1;
        if (matchedBy === 'emp_no') matchedByEmpNo += 1;
        if (matchedBy === 'name') matchedByName += 1;
      }
    }

    const result: TerminationsImportResult = {
      rowsReceived: body.rows.length,
      created,
      duplicates: body.rows.length - created,
      matchedByEmpNo,
      matchedByName,
      unmatched: created - matchedByEmpNo - matchedByName,
    };

    await this.events.append({
      type: 'termination.imported',
      aggregateType: 'termination',
      aggregateId: 'bulk',
      actor: 'user',
      payload: { ...result },
    });

    return result;
  }

  @Get('terminations')
  async list() {
    return this.db.select().from(terminations).orderBy(desc(terminations.terminationDate));
  }

  /**
   * Agregados de permanencia (add-tenure-analytics): calculados en memoria sobre las filas ya
   * cargadas (dataset pequeño, ~178 filas — no justifica SQL crudo). Hitos y mediana solo sobre
   * filas con `tenureDays` no nulo; nunca se inventa permanencia sin ambas fechas.
   */
  @Get('terminations/analytics')
  async analytics(): Promise<TerminationAnalytics> {
    const rows = await this.db
      .select({
        terminationType: terminations.terminationType,
        circuit: terminations.circuit,
        tenureDays: terminations.tenureDays,
      })
      .from(terminations);

    const totalTerminations = rows.length;
    const withTenure = rows.filter((r): r is typeof r & { tenureDays: number } => r.tenureDays !== null);
    const withValidTenure = withTenure.length;

    const milestones = [30, 60, 90].map((days) => {
      const count = withTenure.filter((r) => r.tenureDays <= days).length;
      return { days, count, pct: withValidTenure > 0 ? (count / withValidTenure) * 100 : 0 };
    });

    const byTypeMap = new Map<string, number>();
    for (const r of rows) {
      const key = r.terminationType ?? 'sin_clasificar';
      byTypeMap.set(key, (byTypeMap.get(key) ?? 0) + 1);
    }
    const byType = [...byTypeMap.entries()]
      .map(([type, count]) => ({ type, count, pct: (count / totalTerminations) * 100 }))
      .sort((a, b) => b.count - a.count);

    const byCircuitMap = new Map<string, number[]>();
    for (const r of withTenure) {
      if (!r.circuit) continue;
      const key = normalizeCircuit(r.circuit);
      const arr = byCircuitMap.get(key) ?? [];
      arr.push(r.tenureDays);
      byCircuitMap.set(key, arr);
    }
    const byCircuit = [...byCircuitMap.entries()]
      .map(([circuit, tenures]) => {
        const withinNinety = tenures.filter((t) => t <= 90).length;
        return {
          circuit,
          count: tenures.length,
          withinNinety,
          pctWithinNinety: (withinNinety / tenures.length) * 100,
          medianTenureDays: median(tenures),
        };
      })
      .sort((a, b) => b.pctWithinNinety - a.pctWithinNinety);

    return {
      totalTerminations,
      withValidTenure,
      medianTenureDays: median(withTenure.map((r) => r.tenureDays)),
      milestones,
      byType,
      byCircuit,
    };
  }
}

/** Mediana de un arreglo de números; null si está vacío. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface TenureMilestone {
  days: number;
  count: number;
  pct: number;
}

export interface TerminationTypeBreakdown {
  type: string;
  count: number;
  pct: number;
}

export interface CircuitTenureBreakdown {
  circuit: string;
  count: number;
  withinNinety: number;
  pctWithinNinety: number;
  medianTenureDays: number | null;
}

export interface TerminationAnalytics {
  totalTerminations: number;
  withValidTenure: number;
  medianTenureDays: number | null;
  milestones: TenureMilestone[];
  byType: TerminationTypeBreakdown[];
  byCircuit: CircuitTenureBreakdown[];
}
