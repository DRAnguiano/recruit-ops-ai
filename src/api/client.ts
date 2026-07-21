/**
 * Cliente HTTP de la Torre de Control hacia el backend NestJS.
 * Toda la data de la app viene de aquí — IndexedDB quedó eliminada
 * (openspec change migrate-spa-to-api).
 */

export const API_BASE_URL: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ??
  'http://localhost:3001';

export const WS_URL = `${API_BASE_URL.replace(/^http/, 'ws')}/ws`;

/** URL del binario de media de un mensaje (audio/imagen/documento). */
export function mediaUrl(messageId: string): string {
  return `${API_BASE_URL}/api/messages/${messageId}/media`;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    /** Resto del cuerpo del error de dominio (ej. `allowed`, `issues`). */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('CONNECTION_FAILED', `No se pudo conectar al backend en ${API_BASE_URL}`, 0);
  }

  if (!response.ok) {
    let code = 'HTTP_ERROR';
    let message = `HTTP ${response.status}`;
    let details: Record<string, unknown> = {};
    try {
      const body = (await response.json()) as Record<string, unknown> & {
        code?: string;
        message?: string;
      };
      code = body.code ?? code;
      message = body.message ?? message;
      // Conserva el resto del error de dominio (allowed, issues, …) menos code/message.
      const { code: _c, message: _m, ...rest } = body;
      details = rest;
    } catch {
      // cuerpo no-JSON: se conserva el mensaje genérico
    }
    throw new ApiError(code, message, response.status, details);
  }
  return (await response.json()) as T;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Agota la paginación keyset de un listado (`?limit=&cursor=`). */
export async function fetchAllPages<T>(path: string, limit = 200): Promise<T[]> {
  const separator = path.includes('?') ? '&' : '?';
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const cursorParam: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page: Page<T> = await api<Page<T>>(`${path}${separator}limit=${limit}${cursorParam}`);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
