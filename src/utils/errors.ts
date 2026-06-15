/**
 * Hierarquia de erros da aplicação.
 *
 * Todo erro "esperado" (operacional) herda de AppError e carrega:
 *  - statusCode: status HTTP a devolver
 *  - code: código estável e legível por máquina (ex: USER_NOT_FOUND)
 *  - details: contexto opcional (ex: campos inválidos do Zod)
 *
 * O middleware error-handler converte qualquer um destes no envelope JSON padrão.
 */
export type ErrorDetails = Record<string, unknown>;

interface AppErrorOptions {
  statusCode?: number;
  code?: string;
  details?: ErrorDetails;
  isOperational?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetails;
  public readonly isOperational: boolean;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    // Mantém o stack trace limpo (V8).
    Error.captureStackTrace?.(this, this.constructor);
  }
}

interface SubErrorOptions {
  code?: string;
  details?: ErrorDetails;
  cause?: unknown;
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', options: SubErrorOptions = {}) {
    super(message, {
      statusCode: 400,
      code: options.code ?? 'VALIDATION_ERROR',
      details: options.details,
      cause: options.cause,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado', options: SubErrorOptions = {}) {
    super(message, {
      statusCode: 401,
      code: options.code ?? 'UNAUTHORIZED',
      details: options.details,
      cause: options.cause,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado', options: SubErrorOptions = {}) {
    super(message, {
      statusCode: 403,
      code: options.code ?? 'FORBIDDEN',
      details: options.details,
      cause: options.cause,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado', options: SubErrorOptions = {}) {
    super(message, {
      statusCode: 404,
      code: options.code ?? 'NOT_FOUND',
      details: options.details,
      cause: options.cause,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito de dados', options: SubErrorOptions = {}) {
    super(message, {
      statusCode: 409,
      code: options.code ?? 'CONFLICT',
      details: options.details,
      cause: options.cause,
    });
  }
}

export class InternalError extends AppError {
  constructor(message = 'Erro interno', options: SubErrorOptions = {}) {
    super(message, {
      statusCode: 500,
      code: options.code ?? 'INTERNAL_ERROR',
      details: options.details,
      isOperational: false,
      cause: options.cause,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
