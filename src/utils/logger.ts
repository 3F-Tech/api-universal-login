import { pino, type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/**
 * Campos que NUNCA podem aparecer nos logs (senhas, keys cruas, hashes, tokens).
 * O redact do Pino substitui o valor por [REDACTED] mantendo a estrutura do log.
 */
const redactPaths = [
  'req.headers["x-api-key"]',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.key',
  '*.apiKey',
  '*.key_hash',
  '*.keyHash',
  'password',
  'apiKey',
];

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  base: { service: 'api-universal-login' },
};

if (env.LOG_PRETTY) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname,service',
    },
  };
}

export const logger = pino(options);

export type Logger = typeof logger;
