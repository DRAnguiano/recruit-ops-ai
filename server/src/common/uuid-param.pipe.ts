import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

/** Param de ruta UUID con la misma forma de error 400 que el resto de la API. */
export function uuidParam(): ZodValidationPipe<string> {
  return new ZodValidationPipe(z.string().uuid());
}
