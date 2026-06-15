import type { RequestHandler } from 'express';
import { ADMIN_SCOPE } from '../config/scopes.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/**
 * Decide se um conjunto de scopes cobre o scope exigido.
 * Regras: `admin:*` libera tudo; `<recurso>:*` libera todas as ações do recurso;
 * caso contrário exige correspondência exata.
 */
export function hasScope(scopes: readonly string[], required: string): boolean {
  if (scopes.includes(ADMIN_SCOPE)) return true;
  if (scopes.includes(required)) return true;
  const resource = required.split(':')[0];
  return resource ? scopes.includes(`${resource}:*`) : false;
}

/**
 * Factory de middleware de autorização. Use depois do `apiKeyAuth`.
 * Ex: `router.get('/users', requireScope('users:read'), controller.list)`
 */
export function requireScope(required: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.apiKey) {
      return next(
        new UnauthorizedError('Autenticação por API key necessária.', { code: 'API_KEY_MISSING' }),
      );
    }
    if (!hasScope(req.apiKey.scopes, required)) {
      return next(
        new ForbiddenError(`Escopo insuficiente. Necessário: ${required}.`, {
          code: 'INSUFFICIENT_SCOPE',
          details: { required },
        }),
      );
    }
    next();
  };
}
