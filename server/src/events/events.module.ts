import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';

/**
 * Global: cualquier módulo de dominio emite eventos vía DomainEventsService
 * sin importar internals de otros dominios.
 */
@Global()
@Module({
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class EventsModule {}
