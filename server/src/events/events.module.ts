import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Global: cualquier módulo de dominio emite eventos vía DomainEventsService
 * sin importar internals de otros dominios. El gateway WS vive aquí porque
 * solo re-difunde eventos ya persistidos (design decisión 3).
 */
@Global()
@Module({
  providers: [DomainEventsService, RealtimeGateway],
  exports: [DomainEventsService],
})
export class EventsModule {}
