import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain-error';

/**
 * Serializa DomainError como { code, message } con su status HTTP,
 * sin stack trace ni detalles internos.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.httpStatus).json({
      code: exception.code,
      message: exception.message,
    });
  }
}
