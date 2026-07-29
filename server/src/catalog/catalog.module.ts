import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportService } from './bulk-import.service';
import { CatalogController } from './catalog.controller';
import { CatalogCrudService } from './catalog-crud.service';
import { CatalogEntriesController } from './catalog-entries.controller';
import { CatalogEntriesService } from './catalog-entries.service';
import { CatalogValueService } from './catalog-value.service';
import { SettingsController } from './settings.controller';

/**
 * API de catálogos operativos (design decisión 1): CRUD plano de tablas de
 * configuración sin lógica de dominio propia + settings + imports bulk.
 * Cualquier tabla que gane reglas de negocio se extrae a su propio módulo.
 */
@Module({
  imports: [SettingsModule],
  controllers: [
    CatalogController,
    CatalogEntriesController,
    BulkImportController,
    SettingsController,
  ],
  providers: [
    CatalogCrudService,
    CatalogEntriesService,
    CatalogValueService,
    BulkImportService,
  ],
  exports: [CatalogValueService, BulkImportService],
})
export class CatalogModule {}
