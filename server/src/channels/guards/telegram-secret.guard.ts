import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { loadEnv } from '../../config/env';

/**
 * Valida X-Telegram-Bot-Api-Secret-Token contra TELEGRAM_WEBHOOK_SECRET
 * (el mismo secret que se registra con setWebhook). Sin configurar → 403.
 */
@Injectable()
export class TelegramSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = loadEnv().TELEGRAM_WEBHOOK_SECRET;
    if (!secret) return false;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-telegram-bot-api-secret-token'];
    if (typeof header !== 'string') return false;

    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
