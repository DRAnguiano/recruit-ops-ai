import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { loadEnv } from '../../config/env';

/**
 * Valida X-Hub-Signature-256: HMAC-SHA256 del cuerpo crudo con META_APP_SECRET.
 * Sin secret configurado, o con firma ausente/incorrecta → 403 (Nest convierte
 * el `return false` en ForbiddenException genérica, sin filtrar detalles).
 */
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = loadEnv().META_APP_SECRET;
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
