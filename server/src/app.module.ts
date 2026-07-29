import { Module } from '@nestjs/common';
import { BotModule } from './bot/bot.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CatalogModule } from './catalog/catalog.module';
import { ChannelsModule } from './channels/channels.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { ImportModule } from './import/import.module';
import { JobsModule } from './jobs/jobs.module';
import { RedisModule } from './redis/redis.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventsModule,
    JobsModule,
    SettingsModule,
    HealthModule,
    ChannelsModule,
    ConversationsModule,
    CatalogModule,
    CampaignsModule,
    BotModule,
    CustomFieldsModule,
    ImportModule,
  ],
})
export class AppModule {}
