import { Module } from '@nestjs/common';
import { ChannelsModule } from './channels/channels.module';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
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
  ],
})
export class AppModule {}
