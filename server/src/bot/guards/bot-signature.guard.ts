import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '../../config/env';
import { BOT_SIGNATURE_HEADER, verifyBotSignature } from '../bot-signature';

/**
 * Autentica al bot por HMAC-SHA256 del cuerpo crudo (X-Bot-Signature).
 * Sin BOT_SHARED_SECRET configurado, el endpoint responde 403 siempre.
 */
@Injectable()
export class BotSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const header = request.headers[BOT_SIGNATURE_HEADER];
    return verifyBotSignature(
      request.rawBody,
      typeof header === 'string' ? header : undefined,
      loadEnv().BOT_SHARED_SECRET,
    );
  }
}
