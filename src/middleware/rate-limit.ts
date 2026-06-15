import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Rate limit por API Key (chave = id da key; cai pro IP só se ainda não houver
 * key autenticada). Deve ser montado DEPOIS do apiKeyAuth.
 *
 * Atenção: o store é em memória — por processo. Sob PM2 em cluster o limite é
 * por instância. Para limite global, trocar por um store compartilhado (Redis).
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.apiKey ? `key:${req.apiKey.id}` : `ip:${req.ip ?? 'unknown'}`),
  handler: (_req, _res, next) => {
    next(
      new AppError('Limite de requisições excedido. Tente novamente em instantes.', {
        statusCode: 429,
        code: 'RATE_LIMITED',
      }),
    );
  },
  // Chaveamos por API key (não por IP) e rodamos atrás de proxy: desliga os
  // avisos de validação de IP/trust-proxy do express-rate-limit.
  validate: false,
});
