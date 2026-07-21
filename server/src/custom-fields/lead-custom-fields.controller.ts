import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { uuidParam } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FieldValueSet, fieldValueSetSchema } from './custom-fields.schemas';
import { FieldValuesService } from './field-values.service';

const setPipe = new ZodValidationPipe(fieldValueSetSchema);

/**
 * Valores de campos personalizados de un lead (custom-fields). El `PUT`
 * público siempre escribe con `source: 'human'` fijo en el código — cualquier
 * `source` que venga en el body se descarta (design decisión 5).
 */
@Controller('leads')
export class LeadCustomFieldsController {
  constructor(private readonly values: FieldValuesService) {}

  @Get(':id/custom-fields')
  list(@Param('id', uuidParam()) id: string) {
    return this.values.listValues('lead', id);
  }

  @Put(':id/custom-fields/:key')
  set(
    @Param('id', uuidParam()) id: string,
    @Param('key') key: string,
    @Body(setPipe) body: FieldValueSet,
  ) {
    return this.values.setValue('lead', id, key, body.value, 'human');
  }
}
