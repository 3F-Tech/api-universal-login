import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Carrega o .env antes de validar. Em produção as variáveis podem vir do ambiente
// (PM2/systemd) — dotenv não sobrescreve o que já existe em process.env.
loadDotenv();

/**
 * Booleans em variáveis de ambiente chegam sempre como string ("true"/"false").
 * z.coerce.boolean() trataria "false" como `true` (string não-vazia), então
 * usamos um preprocess explícito.
 */
const booleanFromString = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    }
    return defaultValue;
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Servidor HTTP
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),

  // Banco de dados
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória')
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL deve ser uma connection string PostgreSQL (postgresql://...)',
    ),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: booleanFromString(false).optional(),

  // Segurança
  BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  // API Keys
  API_KEY_PREFIX: z.string().min(1).default('3fc_dev_'),

  // CORS (lista separada por vírgula; vazio = desabilitado)
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // Proxy reverso (Nginx/Caddy) em produção
  TRUST_PROXY: booleanFromString(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Não usamos o logger aqui de propósito: ele é construído a partir do env já validado.

  console.error(`\n❌ Variáveis de ambiente inválidas. A aplicação não vai subir.\n${issues}\n`);
  process.exit(1);
}

const data = parsed.data;

export const env = {
  ...data,
  // LOG_PRETTY: se não informado, liga em tudo que não for produção.
  LOG_PRETTY: data.LOG_PRETTY ?? data.NODE_ENV !== 'production',
  isProduction: data.NODE_ENV === 'production',
  isDevelopment: data.NODE_ENV === 'development',
  isTest: data.NODE_ENV === 'test',
} as const;

export type Env = typeof env;
