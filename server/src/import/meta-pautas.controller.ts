import { Body, Controller, Inject, Post } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { agents } from '../database/schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BulkImportService, BulkResult, CampaignRow } from '../catalog/bulk-import.service';
import { MetaPautasImport, metaPautasImportSchema } from './meta-pautas.schemas';

const pipe = new ZodValidationPipe(metaPautasImportSchema);

/** Semana ISO `YYYY-Www` de una fecha (llave de dedup name+isoWeek). */
function isoWeekOf(dateStr: string): string {
  const src = new Date(dateStr);
  const d = new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth(), src.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Carga de pautas de Meta (meta-pautas-import): resuelve/siembra la agente de
 * cada campaña por nombre (el alias Dulce→Damaris ya lo aplica el cliente) y
 * upserta reutilizando `BulkImportService.upsertCampaigns` (idempotente por
 * name+isoWeek). El export solo trae gasto real en USD; sin `externalId` de
 * Meta, la llave es name+isoWeek.
 */
@Controller('import')
export class MetaPautasController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly bulk: BulkImportService,
  ) {}

  @Post('meta-pautas')
  async importPautas(@Body(pipe) body: MetaPautasImport): Promise<BulkResult> {
    const agentIds = new Map<string, string>();

    const rows: CampaignRow[] = [];
    for (const c of body.campaigns) {
      const targetAgentId = await this.resolveAgent(c.agent, agentIds);
      const isoWeek = c.startDate ? isoWeekOf(c.startDate) : null;
      rows.push({
        name: c.name,
        startDate: c.startDate ?? null,
        endDate: c.endDate ?? null,
        isoWeek,
        // `money` del schema es string; upsertCampaigns lo inserta tal cual en numeric.
        spend: (c.spend ?? 0).toFixed(2),
        currency: 'USD',
        leadsReported: c.leadsReported ?? 0,
        targetAgentId,
      });
    }

    return this.bulk.upsertCampaigns(rows);
  }

  /** Busca la agente por nombre (memoizada por lote); la siembra si no existe. */
  private async resolveAgent(name: string, cache: Map<string, string>): Promise<string> {
    const trimmed = name.trim();
    const cached = cache.get(trimmed);
    if (cached) return cached;

    const existing = await this.db.query.agents.findFirst({ where: eq(agents.name, trimmed) });
    const id = existing
      ? existing.id
      : (await this.db.insert(agents).values({ name: trimmed }).returning())[0]!.id;
    cache.set(trimmed, id);
    return id;
  }
}
