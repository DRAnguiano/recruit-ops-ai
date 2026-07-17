import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CredentialCipher } from '../src/channels/credentials/credential-cipher';

const key = () => randomBytes(32).toString('base64');

describe('CredentialCipher (channel-credentials)', () => {
  it('round-trip: descifra a los mismos secretos', () => {
    const cipher = new CredentialCipher(key());
    const secrets = { access_token: 'EAAG-token', phone_number_id: '555000111' };
    const blob = cipher.encrypt(secrets);
    expect(cipher.decrypt(blob)).toEqual(secrets);
  });

  it('el blob no contiene el texto plano', () => {
    const cipher = new CredentialCipher(key());
    const blob = cipher.encrypt({ app_secret: 'super-secreto-visible' });
    expect(Buffer.from(blob, 'base64').toString('utf8')).not.toContain('super-secreto-visible');
    expect(blob).not.toContain('super-secreto-visible');
  });

  it('IV aleatorio: dos cifrados del mismo valor difieren', () => {
    const cipher = new CredentialCipher(key());
    const a = cipher.encrypt({ v: 'x' });
    const b = cipher.encrypt({ v: 'x' });
    expect(a).not.toEqual(b);
    expect(cipher.decrypt(a)).toEqual(cipher.decrypt(b));
  });

  it('llave incorrecta → descifrado lanza (tag GCM inválido)', () => {
    const blob = new CredentialCipher(key()).encrypt({ v: 'x' });
    expect(() => new CredentialCipher(key()).decrypt(blob)).toThrow();
  });

  it('blob manipulado → descifrado lanza', () => {
    const cipher = new CredentialCipher(key());
    const blob = cipher.encrypt({ v: 'x' });
    const raw = Buffer.from(blob, 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    expect(() => cipher.decrypt(raw.toString('base64'))).toThrow();
  });

  it('llave de tamaño inválido → el constructor lanza', () => {
    expect(() => new CredentialCipher(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
