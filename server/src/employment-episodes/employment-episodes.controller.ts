import { Controller, Get, Post } from '@nestjs/common';
import { EmploymentEpisodesService, EmploymentEpisodeView } from './employment-episodes.service';

@Controller('employment-episodes')
export class EmploymentEpisodesController {
  constructor(private readonly episodes: EmploymentEpisodesService) {}

  @Get()
  list(): Promise<EmploymentEpisodeView[]> {
    return this.episodes.list();
  }

  /** Backfill idempotente: un episodio por operador existente, reejecutable. */
  @Post('backfill')
  backfill(): Promise<{ scanned: number }> {
    return this.episodes.backfill();
  }
}
