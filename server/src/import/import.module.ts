import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ChannelsModule } from '../channels/channels.module';
import { LeadsModule } from '../leads/leads.module';
import { HcCapacityController } from './hc-capacity.controller';
import { MetaPautasController } from './meta-pautas.controller';
import { WhatsappHistoryController } from './whatsapp-history.controller';

/**
 * Cargas de datos administrativas: endpoints que ingieren datos históricos
 * (chats de WhatsApp, pautas de Meta) reutilizando los servicios de
 * canales/leads/catálogos en vez de duplicar su lógica.
 */
@Module({
  imports: [ChannelsModule, LeadsModule, CatalogModule],
  controllers: [WhatsappHistoryController, MetaPautasController, HcCapacityController],
})
export class ImportModule {}
