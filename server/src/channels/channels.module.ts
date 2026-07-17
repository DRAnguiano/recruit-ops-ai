import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { InstagramAdapter, MessengerAdapter } from './adapters/meta-messaging.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { ChannelQueuesService } from './channel-queues.service';
import {
  InstagramSender,
  MessengerSender,
  TelegramSender,
  WhatsAppSender,
} from './channel-senders';
import { MediaDownloadService } from './media/media-download.service';
import { TelegramMediaDownloader, WhatsAppMediaDownloader } from './media/media-downloaders';
import { FilesystemMediaStorage, MEDIA_STORAGE } from './media/media-storage';
import { MessageIngestionService } from './message-ingestion.service';
import { OutboundService } from './outbound.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [LeadsModule],
  controllers: [WebhooksController],
  providers: [
    WhatsAppAdapter,
    TelegramAdapter,
    MessengerAdapter,
    InstagramAdapter,
    MessageIngestionService,
    ChannelQueuesService,
    MediaDownloadService,
    WhatsAppMediaDownloader,
    TelegramMediaDownloader,
    WhatsAppSender,
    TelegramSender,
    MessengerSender,
    InstagramSender,
    OutboundService,
    { provide: MEDIA_STORAGE, useClass: FilesystemMediaStorage },
  ],
  exports: [MessageIngestionService, MEDIA_STORAGE, OutboundService, ChannelQueuesService],
})
export class ChannelsModule {}
