import type { RequestHandler } from 'express';
import { prisma } from '../config/database.js';
import { hashApiKey } from '../utils/api-key-generator.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const API_KEY_HEADER = 'x-api-key';

/**
 * Autenticação por API Key.
 *
 * Lê o header X-API-Key, calcula o SHA-256 e procura por `key_hash`. Rejeita
 * key ausente/inválida/inativa/expirada e sistema desativado. Em sucesso injeta
 * `req.apiKey` e `req.system`, e atualiza `last_used_at` em background.
 */
export const apiKeyAuth: RequestHandler = async (req, _res, next) => {
  try {
    const headerValue = req.header(API_KEY_HEADER);
    if (!headerValue || headerValue.trim().length === 0) {
      throw new UnauthorizedError('API key ausente. Envie o header X-API-Key.', {
        code: 'API_KEY_MISSING',
      });
    }

    const keyHash = hashApiKey(headerValue.trim());
    const apiKey = await prisma.api_key.findUnique({
      where: { key_hash: keyHash },
      include: { system: true },
    });

    if (!apiKey) {
      throw new UnauthorizedError('API key inválida.', { code: 'API_KEY_INVALID' });
    }
    if (!apiKey.is_active) {
      throw new UnauthorizedError('API key inativa.', { code: 'API_KEY_INACTIVE' });
    }
    if (apiKey.expires_at && apiKey.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedError('API key expirada.', { code: 'API_KEY_EXPIRED' });
    }
    if (!apiKey.system.is_active) {
      throw new ForbiddenError('O sistema dono desta API key está desativado.', {
        code: 'SYSTEM_INACTIVE',
      });
    }

    req.apiKey = apiKey;
    req.system = apiKey.system;

    // Best-effort: não bloqueia a request nem falha se a atualização der erro.
    prisma.api_key
      .update({ where: { id: apiKey.id }, data: { last_used_at: new Date() } })
      .catch((err: unknown) => {
        logger.warn({ err, key_prefix: apiKey.key_prefix }, 'Falha ao atualizar last_used_at');
      });

    next();
  } catch (err) {
    next(err);
  }
};
