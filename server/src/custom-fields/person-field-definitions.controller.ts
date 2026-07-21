import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { uuidParam } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  FieldDefinitionCreate,
  fieldDefinitionCreateSchema,
  FieldDefinitionUpdate,
  fieldDefinitionUpdateSchema,
} from './custom-fields.schemas';
import { FieldDefinitionsService } from './field-definitions.service';

const createPipe = new ZodValidationPipe(fieldDefinitionCreateSchema);
const updatePipe = new ZodValidationPipe(fieldDefinitionUpdateSchema);

/** CRUD del diccionario de campos personalizados de persona (custom-fields). */
@Controller('person-field-definitions')
export class PersonFieldDefinitionsController {
  constructor(private readonly definitions: FieldDefinitionsService) {}

  @Get()
  list() {
    return this.definitions.list('person');
  }

  @Post()
  create(@Body(createPipe) body: FieldDefinitionCreate) {
    return this.definitions.create('person', body);
  }

  @Patch(':id')
  update(@Param('id', uuidParam()) id: string, @Body(updatePipe) body: FieldDefinitionUpdate) {
    return this.definitions.update('person', id, body);
  }

  @Delete(':id')
  remove(@Param('id', uuidParam()) id: string) {
    return this.definitions.remove('person', id);
  }
}
