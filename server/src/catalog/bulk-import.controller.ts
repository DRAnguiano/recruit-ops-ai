import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BulkImportService } from './bulk-import.service';
import { campaignsBulkSchema, operatorsBulkSchema } from './catalog.schemas';

@Controller()
export class BulkImportController {
  constructor(private readonly bulk: BulkImportService) {}

  @Post('operators/bulk')
  operators(
    @Body(new ZodValidationPipe(operatorsBulkSchema))
    body: z.infer<typeof operatorsBulkSchema>,
  ) {
    return this.bulk.upsertOperators(body.items);
  }

  @Post('campaigns/bulk')
  campaigns(
    @Body(new ZodValidationPipe(campaignsBulkSchema))
    body: z.infer<typeof campaignsBulkSchema>,
  ) {
    return this.bulk.upsertCampaigns(body.items);
  }
}
