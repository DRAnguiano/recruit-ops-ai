import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ChannelCredentialsService } from '../credentials/channel-credentials.service';

/**
 * Valida X-Hub-Signature-256: HMAC-SHA256 del cuerpo crudo con el app_secret de
 * la credencial `meta_app` activa (channel-credentials). Sin credencial, o con
 * firma ausente/incorrecta → 403 (Nest convierte el `return false` en
 * ForbiddenException genérica, sin filtrar detalles).
 */
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  constructor(private readonly credentials: ChannelCredentialsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = (await this.credentials.metaApp())?.app_secret;
    if (!secret) return false;

    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const header = request.headers['x-hub-signature-256'];
    if (typeof header !== 'string' || !request.rawBody) return false;

    const expected = `sha256=${createHmac('sha256', secret).update(request.rawBody).digest('hex')}`;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
