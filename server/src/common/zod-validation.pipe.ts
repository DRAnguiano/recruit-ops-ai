import { PipeTransform } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';
import { DomainError } from './domain-error';

/**
 * Valida body/query contra un schema zod ANTES de tocar lógica de dominio.
 * Entrada inválida responde 400 { code: 'VALIDATION_ERROR', message, issues }.
 * El input del schema es `unknown` para admitir transforms (input ≠ output).
 *
 * Uso: @Body(new ZodValidationPipe(schema)) dto: z.infer<typeof schema>
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new DomainError('VALIDATION_ERROR', 'Entrada inválida', 400, {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
