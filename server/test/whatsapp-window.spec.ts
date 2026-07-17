import { describe, expect, it } from 'vitest';
import { getWindowState, WHATSAPP_WINDOW_MS } from '../src/channels/whatsapp-window';

describe('ventana de 24 h de WhatsApp (whatsapp-window-policy)', () => {
  const now = new Date('2026-07-16T12:00:00Z');

  it('abierta dentro de las 24 h del último inbound', () => {
    const state = getWindowState(new Date('2026-07-16T10:00:00Z'), now);
    expect(state.open).toBe(true);
    expect(state.expiresAt).toEqual(new Date('2026-07-17T10:00:00Z'));
  });

  it('cerrada pasadas las 24 h', () => {
    const state = getWindowState(new Date('2026-07-15T11:00:00Z'), now);
    expect(state.open).toBe(false);
    expect(state.expiresAt).toEqual(new Date('2026-07-16T11:00:00Z'));
  });

  it('sin mensaje entrante nunca hay ventana', () => {
    const state = getWindowState(null, now);
    expect(state.open).toBe(false);
    expect(state.expiresAt).toBeNull();
  });

  it('el borde exacto de 24 h cuenta como expirado', () => {
    const lastInbound = new Date(now.getTime() - WHATSAPP_WINDOW_MS);
    expect(getWindowState(lastInbound, now).open).toBe(false);
    // Un milisegundo antes del borde sigue abierta.
    const justInside = new Date(now.getTime() - WHATSAPP_WINDOW_MS + 1);
    expect(getWindowState(justInside, now).open).toBe(true);
  });
});
