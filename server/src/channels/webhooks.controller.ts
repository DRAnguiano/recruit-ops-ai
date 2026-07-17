import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { loadEnv } from '../config/env';
import { InstagramAdapter, MessengerAdapter } from './adapters/meta-messaging.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { ChannelQueuesService } from './channel-queues.service';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { TelegramSecretGuard } from './guards/telegram-secret.guard';

/**
 * Puerta de entrada omnicanal. Política de ACK: una vez autenticado el
 * request, SIEMPRE 200 — payloads sin mensajes procesables (statuses, edits,
 * echoes, eventos de lectura) se aceptan sin efecto. Un webhook que
 * responde 5xx repetidamente es desactivado por Meta.
 *
 * Desde add-media-messages el controlador solo autentica, parsea y ENCOLA
 * (`channels.inbound`); la ingestión corre en el worker. El ACK ya no depende
 * de Postgres: con la DB caída los mensajes esperan en Redis con reintentos.
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly whatsappAdapter: WhatsAppAdapter,
    private readonly telegramAdapter: TelegramAdapter,
    private readonly messengerAdapter: MessengerAdapter,
    private readonly instagramAdapter: InstagramAdapter,
    private readonly queues: ChannelQueuesService,
  ) {}

  /** Handshake de verificación de Meta al registrar el webhook. */
  @Get('meta')
  verifyMeta(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = loadEnv().META_VERIFY_TOKEN;
    if (!expected || mode !== 'subscribe' || verifyToken !== expected || !challenge) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  @Post('meta')
  @HttpCode(200)
  @UseGuards(MetaSignatureGuard)
  async receiveMeta(@Body() payload: Record<string, unknown>): Promise<{ received: true }> {
    const object = payload?.object;
    if (object === 'whatsapp_business_account') {
      await this.queues.enqueueInbound(this.whatsappAdapter.parse(payload));
      // Los statuses de entrega dejaron de descartarse (delivery-status spec).
      const statuses = this.whatsappAdapter.parseStatuses(payload);
      if (statuses.length > 0) {
        await this.queues.enqueueDeliveryStatuses(
          statuses.map((s) => ({ channel: 'whatsapp', ...s })),
        );
      }
    } else if (object === 'page') {
      await this.queues.enqueueInbound(this.messengerAdapter.parse(payload));
    } else if (object === 'instagram') {
      await this.queues.enqueueInbound(this.instagramAdapter.parse(payload));
    } else {
      this.logger.log(`Evento Meta no procesado: object=${String(object)}`);
    }
    return { received: true };
  }

  @Post('telegram')
  @HttpCode(200)
  @UseGuards(TelegramSecretGuard)
  async receiveTelegram(
    @Body() update: Record<string, unknown>,
  ): Promise<{ received: true }> {
    await this.queues.enqueueInbound(this.telegramAdapter.parse(update));
    return { received: true };
  }
}
