import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { JobsModule } from '../jobs/jobs.module';
import { BotActionsService } from './bot-actions.service';
import { BotController } from './bot.controller';
import { BotNotifierService } from './bot-notifier.service';
import { BotQueue } from './bot.queue';

/**
 * Gateway hacia el bot FastAPI externo (bot-gateway/bot-actions specs):
 * notificación firmada de mensajes entrantes y catálogo cerrado de acciones.
 * La IA nunca decide — todo pasa por validación del backend.
 */
@Module({
  imports: [ChannelsModule, JobsModule],
  controllers: [BotController],
  providers: [BotNotifierService, BotQueue, BotActionsService],
})
export class BotModule {}
