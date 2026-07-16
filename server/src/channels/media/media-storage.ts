import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadEnv } from '../../config/env';

/**
 * Abstracción de almacenamiento de binarios. El dominio solo conoce
 * `storageKey`; la implementación S3/MinIO llegará con la decisión de
 * despliegue (open question del change add-channel-webhooks).
 */
export interface MediaStorage {
  save(key: string, data: Buffer): Promise<{ sizeBytes: number }>;
  /** Ruta/URI absoluta del binario, para consumidores locales (bot-gateway). */
  locate(key: string): string;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

@Injectable()
export class FilesystemMediaStorage implements MediaStorage {
  private get baseDir(): string {
    return resolve(loadEnv().MEDIA_STORAGE_DIR);
  }

  async save(key: string, data: Buffer): Promise<{ sizeBytes: number }> {
    const path = this.locate(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { sizeBytes: data.byteLength };
  }

  locate(key: string): string {
    return join(this.baseDir, key);
  }
}
