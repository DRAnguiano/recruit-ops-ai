import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/common/domain-error';
import { decodeCursor, encodeCursor, toPage } from '../src/common/pagination';

describe('paginación keyset (api-conventions)', () => {
  it('encode/decode son inversos', () => {
    const parts: [string, string] = ['2026-07-15T10:00:00.000Z', 'abc-123'];
    expect(decodeCursor(encodeCursor(parts))).toEqual(parts);
  });

  it('decodeCursor rechaza cursores malformados con VALIDATION_ERROR', () => {
    for (const bad of ['no-es-base64-json', Buffer.from('{"x":1}').toString('base64url'), '']) {
      try {
        decodeCursor(bad);
        expect.unreachable('debió lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    }
  });

  it('toPage corta a limit y emite nextCursor solo si hay más filas', () => {
    const rows = [
      { at: '3', id: 'c' },
      { at: '2', id: 'b' },
      { at: '1', id: 'a' },
    ];
    const page = toPage(rows, 2, (r) => [r.at, r.id]);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(encodeCursor(['2', 'b']));

    const lastPage = toPage(rows.slice(2), 2, (r) => [r.at, r.id]);
    expect(lastPage.items).toHaveLength(1);
    expect(lastPage.nextCursor).toBeNull();
  });

  it('página exactamente llena sin filas extra no emite cursor', () => {
    const rows = [{ at: '1', id: 'a' }];
    const page = toPage(rows, 1, (r) => [r.at, r.id]);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
