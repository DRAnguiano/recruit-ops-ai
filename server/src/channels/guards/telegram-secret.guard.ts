import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ChannelCredentialsService } from '../credentials/channel-credentials.service';

/**
 * Valida X-Telegram-Bot-Api-Secret-Token contra el webhook_secret de la
 * credencial `telegram` activa (channel-credentials; el mismo secret que se
 * registra con setWebhook). Sin credencial activa → 403.
 */
@Injectable()
export class TelegramSecretGuard implements CanActivate {
  constructor(private readonly credentials: ChannelCredentialsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = (await this.credentials.telegram())?.webhook_secret;
    if (!secret) return false;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-telegram-bot-api-secret-token'];
    if (typeof header !== 'string') return false;

    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
