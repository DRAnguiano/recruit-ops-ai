import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { DomainEvent, DomainEventsService } from './domain-events.service';

/**
 * Difusión servidor→clientes de eventos de dominio por WebSocket nativo
 * (design decisión 2). Fire-and-forget: un socket lento o roto jamás afecta
 * la persistencia ni a los demás clientes. La reconexión es del cliente.
 */
@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly clients = new Set<WebSocket>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly events: DomainEventsService) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe((event) => this.broadcast(event));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // el cierre de un socket ya roto no importa
      }
    }
    this.clients.clear();
  }

  handleConnection(client: WebSocket): void {
    this.clients.add(client);
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  private broadcast(event: DomainEvent): void {
    if (this.clients.size === 0) return;

    // Solo datos del dominio: nunca rutas de filesystem ni claves de storage
    // internas (la media se descarga vía GET /api/messages/:id/media).
    const { storageKey: _storageKey, ...payload } = event.payload as Record<string, unknown>;
    const frame = JSON.stringify({
      type: event.type,
      payload: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        actor: event.actor,
        occurredAt: event.occurredAt,
        ...payload,
      },
    });

    for (const client of this.clients) {
      if (client.readyState !== client.OPEN) continue;
      try {
        client.send(frame, (error) => {
          if (error) this.logger.debug(`send WS falló: ${String(error)}`);
        });
      } catch (error) {
        this.logger.debug(`cliente WS roto ignorado: ${String(error)}`);
      }
    }
  }
}
