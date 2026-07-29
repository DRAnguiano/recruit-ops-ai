import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { circuitCapacity } from '../database/schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DomainEventsService } from '../events/domain-events.service';
import { HcCapacityImport, hcCapacityImportSchema } from './hc-capacity.schemas';

const pipe = new ZodValidationPipe(hcCapacityImportSchema);

export interface CapacityImportResult {
  created: number;
  updated: number;
}

/**
 * Capacidad de dotación por circuito (operational-capacity): upsert idempotente
 * del snapshot de HC autorizado vs. real. `deficit` se recalcula
 * `hcAuthorized − hcReal` (más robusto que la columna DIF del reporte).
 */
@Controller()
export class HcCapacityController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
  ) {}

  @Post('import/hc-capacity')
  async importCapacity(@Body(pipe) body: HcCapacityImport): Promise<CapacityImportResult> {
    let created = 0;
    let updated = 0;

    for (const c of body.circuits) {
      const hcAuthorized = c.hcAuthorized ?? 0;
      const hcReal = c.hcReal ?? 0;
      const values = {
        circuit: c.circuit.trim(),
        units: c.units ?? 0,
        unitsInMaintenance: c.unitsInMaintenance ?? 0,
        unitsActive: c.unitsActive ?? 0,
        hcAuthorized,
        hcReal,
        deficit: hcAuthorized - hcReal,
        sourceDeficit: c.sourceDeficit ?? null,
        snapshotDate: body.snapshotDate ?? null,
      };

      const existing = await this.db.query.circuitCapacity.findFirst({
        where: eq(circuitCapacity.circuit, values.circuit),
      });
      if (existing) {
        await this.db
          .update(circuitCapacity)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(circuitCapacity.id, existing.id));
        updated += 1;
      } else {
        await this.db.insert(circuitCapacity).values(values);
        created += 1;
      }
    }

    await this.events.append({
      type: 'circuit_capacity.imported',
      aggregateType: 'circuit_capacity',
      aggregateId: 'snapshot',
      actor: 'user',
      payload: { created, updated, snapshotDate: body.snapshotDate ?? null },
    });

    return { created, updated };
  }

  @Get('circuit-capacity')
  async list() {
    return this.db
      .select()
      .from(circuitCapacity)
      .orderBy(desc(circuitCapacity.deficit), circuitCapacity.circuit);
  }
}
