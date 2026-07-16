/**
 * Error de dominio tipado: toda falla de negocio se lanza con un código
 * estable + mensaje. Nunca lanzar strings ni `Error` genérico para fallas
 * de dominio (regla de openspec/project.md §11).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
