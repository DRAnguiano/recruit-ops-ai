import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { ClassificationRulesService } from './classification-rules.service';
import { LeadPipelineService } from './lead-pipeline.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [SchedulesModule, CatalogModule],
  controllers: [LeadsController],
  providers: [LeadPipelineService, ClassificationRulesService, LeadsService],
  exports: [LeadPipelineService, LeadsService],
})
export class LeadsModule {}
