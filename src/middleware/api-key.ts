import type { RequestHandler } from 'express';
import { prisma } from '../config/database.js';
import { hashApiKey } from '../utils/api-key-generator.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const API_KEY_HEADER = 'x-api-key';
const CACHE_TTL_MS = 30_000; // 30 s — revogação demora até 30 s para ser detectada
const LAST_USED_INTERVAL_MS = 5 * 60 * 1000; // 5 min

async function findApiKeyWithSystem(keyHash: string) {
  return prisma.api_key.findUnique({
    where: { key_hash: keyHash },
    include: { system: true },
  });
}

type ApiKeyWithSystem = NonNullable<Awaited<ReturnType<typeof findApiKeyWithSystem>>>;

const keyCache = new Map<string, { data: ApiKeyWithSystem; expiresAt: number }>();

// Deduplicação de lookups concorrentes: 6 rotas com a mesma key compartilham
// uma única Promise de DB em vez de cada uma disparar a sua.
const pendingLookups = new Map<string, Promise<ApiKeyWithSystem | null>>();

// Controle de debounce para last_used_at (por key id, em memória).
const lastUpdateByKeyId = new Map<number, number>();

/**
 * Retorna a API key do cache ou de uma DB query deduplicada.
 * Múltiplos requests concorrentes com o mesmo keyHash compartilham 1 Promise,
 * reduzindo de N queries para 1 no burst inicial de carga da página.
 */
async function getApiKey(keyHash: string, now: number): Promise<ApiKeyWithSystem | null> {
  // 1. Cache hit (sem DB, sem rede)
  const cached = keyCache.get(keyHash);
  if (cached && cached.expiresAt > now) return cached.data;

  // 2. Lookup já em andamento? Reutiliza a Promise existente
  const pending = pendingLookups.get(keyHash);
  if (pending) return pending;

  // 3. Novo lookup — registra antes do await para que requests concorrentes o peguem
  const promise = findApiKeyWithSystem(keyHash)
    .then((result) => {
      pendingLookups.delete(keyHash);
      if (result) keyCache.set(keyHash, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    })
    .catch((err: unknown) => {
      pendingLookups.delete(keyHash);
      throw err;
    });

  pendingLookups.set(keyHash, promise);
  return promise;
}

/**
 * Autenticação por API Key.
 *
 * Lê o header X-API-Key, calcula o SHA-256 e valida contra o banco (com cache
 * em memória de 30 s e deduplicação de requests concorrentes). Injeta
 * `req.apiKey` e `req.system`. Atualiza `last_used_at` no máximo a cada 5 min.
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
    const now = Date.now();
    const apiKey = await getApiKey(keyHash, now);

    if (!apiKey) {
      throw new UnauthorizedError('API key inválida.', { code: 'API_KEY_INVALID' });
    }
    if (!apiKey.is_active) {
      throw new UnauthorizedError('API key inativa.', { code: 'API_KEY_INACTIVE' });
    }
    if (apiKey.expires_at && apiKey.expires_at.getTime() < now) {
      throw new UnauthorizedError('API key expirada.', { code: 'API_KEY_EXPIRED' });
    }
    if (!apiKey.system.is_active) {
      throw new ForbiddenError('O sistema dono desta API key está desativado.', {
        code: 'SYSTEM_INACTIVE',
      });
    }

    req.apiKey = apiKey;
    req.system = apiKey.system;

    // Debounce: marca em memória antes do await para que requests concorrentes
    // na mesma janela não disparem múltiplos updates.
    const lastUpdate = lastUpdateByKeyId.get(apiKey.id) ?? 0;
    if (now - lastUpdate > LAST_USED_INTERVAL_MS) {
      lastUpdateByKeyId.set(apiKey.id, now);
      prisma.api_key
        .update({ where: { id: apiKey.id }, data: { last_used_at: new Date() } })
        .catch((err: unknown) => {
          logger.warn({ err, key_prefix: apiKey.key_prefix }, 'Falha ao atualizar last_used_at');
        });
    }

    next();
  } catch (err) {
    next(err);
  }
};
