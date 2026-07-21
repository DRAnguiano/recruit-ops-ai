import { Module } from '@nestjs/common';
import { FieldDefinitionsService } from './field-definitions.service';
import { FieldValuesService } from './field-values.service';
import { LeadFieldDefinitionsController } from './lead-field-definitions.controller';
import { PersonFieldDefinitionsController } from './person-field-definitions.controller';
import { LeadCustomFieldsController } from './lead-custom-fields.controller';
import { PersonCustomFieldsController } from './person-custom-fields.controller';

/**
 * Diccionario de campos personalizados de lead/persona + sus valores con
 * evidencia (custom-fields). Sin imports hacia LeadsModule: consulta
 * `leads`/`people` directamente para el chequeo de existencia, igual que
 * CatalogModule hace con otras tablas de negocio.
 */
@Module({
  controllers: [
    LeadFieldDefinitionsController,
    PersonFieldDefinitionsController,
    LeadCustomFieldsController,
    PersonCustomFieldsController,
  ],
  providers: [FieldDefinitionsService, FieldValuesService],
})
export class CustomFieldsModule {}
