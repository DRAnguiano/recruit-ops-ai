import { createHmac, timingSafeEqual } from 'node:crypto';

export const BOT_SIGNATURE_HEADER = 'x-bot-signature';

/** Firma HMAC-SHA256 del cuerpo crudo, simétrica en ambas direcciones. */
export function signBotBody(body: string | Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function verifyBotSignature(
  body: Buffer | undefined,
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !body || !header) return false;
  const expected = Buffer.from(signBotBody(body, secret));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
