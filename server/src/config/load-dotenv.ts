import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga variables desde `server/.env` o, en su defecto, el `.env` de la raíz
 * del repo, sin sobreescribir variables ya presentes en el proceso.
 * Usa el loader nativo de Node 22 — sin dependencia de dotenv.
 */
export function loadDotenv(): void {
  const candidates = [resolve(__dirname, '../../.env'), resolve(__dirname, '../../../.env')];
  for (const path of candidates) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}
