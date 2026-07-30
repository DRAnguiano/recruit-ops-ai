import { Module } from '@nestjs/common';
import { CampaignOffersController } from './campaign-offers.controller';
import { CampaignOffersService } from './campaign-offers.service';

@Module({
  controllers: [CampaignOffersController],
  providers: [CampaignOffersService],
  exports: [CampaignOffersService],
})
export class CampaignOffersModule {}
