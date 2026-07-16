import { Module } from '@nestjs/common';
import { SchedulesModule } from '../schedules/schedules.module';
import { ClassificationRulesService } from './classification-rules.service';
import { LeadPipelineService } from './lead-pipeline.service';

@Module({
  imports: [SchedulesModule],
  providers: [LeadPipelineService, ClassificationRulesService],
  exports: [LeadPipelineService],
})
export class LeadsModule {}
