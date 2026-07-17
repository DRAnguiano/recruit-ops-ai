/**
 * Cliente WebSocket del inbox en vivo: recibe los frames { type, payload }
 * que difunde el backend y reconecta solo con backoff exponencial (1s→30s).
 */

import { WS_URL } from './client';

export interface RealtimeFrame {
  type: string;
  payload: Record<string, unknown>;
}

export type RealtimeHandler = (frame: RealtimeFrame) => void;

/** Abre la conexión y devuelve el cleanup (para useEffect). */
export function connectRealtime(onFrame: RealtimeHandler): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let retryMs = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = (): void => {
    if (closed) return;
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      retryMs = 1000;
    };
    socket.onmessage = (event) => {
      try {
        onFrame(JSON.parse(String(event.data)) as RealtimeFrame);
      } catch {
        // frame malformado: se ignora
      }
    };
    socket.onclose = () => {
      if (closed) return;
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };
    socket.onerror = () => {
      socket?.close();
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
  };
}
