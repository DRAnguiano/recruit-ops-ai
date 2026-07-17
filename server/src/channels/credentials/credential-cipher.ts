import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Cifrado simétrico de los secretos de credenciales de canal
 * (channel-credentials): AES-256-GCM con IV aleatorio por escritura y tag
 * autenticado. El blob persistido es base64(iv || authTag || ciphertext), así
 * que la DB nunca ve texto plano y una llave incorrecta falla al descifrar.
 */
export class CredentialCipher {
  private readonly key: Buffer;

  /** @param keyBase64 llave maestra base64 que decodifica a exactamente 32 bytes. */
  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `CHANNEL_CREDENTIALS_KEY debe decodificar a ${KEY_BYTES} bytes (recibidos ${key.length})`,
      );
    }
    this.key = key;
  }

  /** Cifra un objeto de secretos → base64(iv || authTag || ciphertext). */
  encrypt(secrets: Record<string, string>): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  /**
   * Descifra el blob de vuelta al objeto de secretos. Lanza si la llave es
   * incorrecta o el blob fue manipulado (tag GCM inválido) o está corrupto.
   */
  decrypt(blob: string): Record<string, string> {
    const raw = Buffer.from(blob, 'base64');
    if (raw.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Blob de credencial corrupto o truncado');
    }
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as Record<string, string>;
  }
}
