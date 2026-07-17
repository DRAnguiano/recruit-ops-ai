import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { uuidParam } from '../../common/uuid-param.pipe';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ChannelCredentialsService } from './channel-credentials.service';
import {
  CredentialCreate,
  CredentialUpdate,
  credentialCreateSchema,
  credentialUpdateSchema,
} from './channel-credentials.schemas';

const createPipe = new ZodValidationPipe(credentialCreateSchema);
const updatePipe = new ZodValidationPipe(credentialUpdateSchema);

/**
 * CRUD de credenciales de canal (channel-credentials). Las lecturas devuelven
 * solo metadatos + `configured`; los secretos entran al escribir y jamás salen.
 */
@Controller('channel-credentials')
export class ChannelCredentialsController {
  constructor(private readonly credentials: ChannelCredentialsService) {}

  @Get()
  list() {
    return this.credentials.list();
  }

  @Post()
  create(@Body(createPipe) body: CredentialCreate) {
    return this.credentials.create(body.kind, body.label, body.secrets);
  }

  @Patch(':id')
  update(@Param('id', uuidParam()) id: string, @Body(updatePipe) body: CredentialUpdate) {
    return this.credentials.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', uuidParam()) id: string) {
    return this.credentials.remove(id);
  }
}
