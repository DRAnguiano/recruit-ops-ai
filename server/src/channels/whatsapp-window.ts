/**
 * Ventana de servicio de 24 h de WhatsApp (whatsapp-window-policy spec):
 * texto libre solo dentro de las 24 h posteriores al ÚLTIMO mensaje entrante
 * del usuario; fuera de ella, solo plantillas aprobadas. Función pura — la
 * política la impone el backend, nunca la disciplina del usuario (project.md §4).
 */

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WindowState {
  open: boolean;
  /** null cuando nunca hubo mensaje entrante (no hay ventana que expirar). */
  expiresAt: Date | null;
}

export function getWindowState(lastInboundAt: Date | null, now: Date): WindowState {
  if (!lastInboundAt) return { open: false, expiresAt: null };
  const expiresAt = new Date(lastInboundAt.getTime() + WHATSAPP_WINDOW_MS);
  // El borde exacto cuenta como expirado: en la duda, la política más estricta.
  return { open: now.getTime() < expiresAt.getTime(), expiresAt };
}
