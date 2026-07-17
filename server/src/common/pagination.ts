import { z } from 'zod';
import { DomainError } from './domain-error';

/**
 * Paginación keyset: el cursor es base64url del JSON [valorDeOrden, id].
 * Estable ante inserciones en vivo (a diferencia de offset): la siguiente
 * página siempre continúa después de la última fila vista.
 */

export interface Page<T> {
  items: T[];
  /** null en la última página. */
  nextCursor: string | null;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().min(1).optional(),
});

export type CursorParts = [string, string];

export function encodeCursor(parts: CursorParts): string {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorParts {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // cae al error tipado de abajo
  }
  throw new DomainError('VALIDATION_ERROR', 'Cursor de paginación inválido', 400, {
    issues: [{ path: 'cursor', message: 'cursor malformado' }],
  });
}

/**
 * Corta `rows` (consultadas con limit+1) a la página solicitada y calcula el
 * cursor siguiente a partir de la última fila incluida.
 */
export function toPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => CursorParts,
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const hasMore = rows.length > limit;
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
  };
}
