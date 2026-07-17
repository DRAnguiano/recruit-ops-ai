import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessageMediaController } from './message-media.controller';

/** API del inbox: conversaciones, mensajes, comandos y descarga de media. */
@Module({
  imports: [ChannelsModule],
  controllers: [ConversationsController, MessageMediaController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
