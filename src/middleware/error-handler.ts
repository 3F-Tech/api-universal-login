import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

function mapPrismaKnownError(err: Prisma.PrismaClientKnownRequestError): NormalizedError {
  switch (err.code) {
    case 'P2002': // unique constraint
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Já existe um registro com esse valor único.',
        details: { target: err.meta?.['target'] },
      };
    case 'P2025': // record not found
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Registro não encontrado.' };
    case 'P2003': // foreign key constraint
      return {
        statusCode: 409,
        code: 'FK_CONSTRAINT',
        message: 'Violação de chave estrangeira (registro relacionado ausente ou em uso).',
        details: { field: err.meta?.['field_name'] },
      };
    default:
      return {
        statusCode: 400,
        code: `PRISMA_${err.code}`,
        message: 'Erro ao acessar o banco de dados.',
      };
  }
}

function normalize(err: unknown): NormalizedError {
  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }
  if (isAppError(err)) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaKnownError(err);
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Requisição inválida para o banco de dados.',
    };
  }
  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' };
}

/**
 * Captura tudo que chega via next(err) (e, no Express 5, promises rejeitadas)
 * e devolve o envelope JSON padrão:
 *   { "error": { "code", "message", "details"? } }
 * 5xx logam stack completo; 4xx logam só mensagem + contexto.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { statusCode, code, message, details } = normalize(err);

  const context = { method: req.method, url: req.originalUrl, statusCode, code };
  if (statusCode >= 500) {
    logger.error({ err, ...context }, 'Erro não tratado');
  } else {
    logger.warn({ ...context, message, details }, 'Erro de requisição');
  }

  // Em 5xx não vazamos detalhes internos ao cliente.
  const clientMessage = statusCode >= 500 ? 'Erro interno do servidor.' : message;

  res.status(statusCode).json({
    error: {
      code,
      message: clientMessage,
      ...(details !== undefined && statusCode < 500 ? { details } : {}),
    },
  });
};
