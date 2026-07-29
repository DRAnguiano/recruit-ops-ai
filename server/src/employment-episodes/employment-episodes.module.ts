import { Module } from '@nestjs/common';
import { EmploymentEpisodesController } from './employment-episodes.controller';
import { EmploymentEpisodesService } from './employment-episodes.service';

@Module({
  controllers: [EmploymentEpisodesController],
  providers: [EmploymentEpisodesService],
  exports: [EmploymentEpisodesService],
})
export class EmploymentEpisodesModule {}
