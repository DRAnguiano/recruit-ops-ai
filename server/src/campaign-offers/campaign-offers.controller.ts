import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { uuidParam } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CampaignOfferCreate,
  CampaignOfferUpdate,
  campaignOfferCreateSchema,
  campaignOfferUpdateSchema,
} from './campaign-offers.schemas';
import { CampaignOffersService } from './campaign-offers.service';

const createPipe = new ZodValidationPipe(campaignOfferCreateSchema);
const updatePipe = new ZodValidationPipe(campaignOfferUpdateSchema);

@Controller()
export class CampaignOffersController {
  constructor(private readonly offers: CampaignOffersService) {}

  @Get('campaigns/:campaignId/offers')
  list(@Param('campaignId', uuidParam()) campaignId: string) {
    return this.offers.listForCampaign(campaignId);
  }

  @Post('campaigns/:campaignId/offers')
  createDraft(
    @Param('campaignId', uuidParam()) campaignId: string,
    @Body(createPipe) body: CampaignOfferCreate,
  ) {
    return this.offers.createDraft(campaignId, body);
  }

  @Patch('campaign-offers/:id')
  update(@Param('id', uuidParam()) id: string, @Body(updatePipe) body: CampaignOfferUpdate) {
    return this.offers.update(id, body);
  }

  @Post('campaign-offers/:id/publish')
  publish(@Param('id', uuidParam()) id: string) {
    return this.offers.publish(id);
  }
}
