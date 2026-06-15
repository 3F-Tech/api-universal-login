import { createHash, randomInt } from 'node:crypto';
import { env } from '../config/env.js';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const RANDOM_LENGTH = 32;
const PREFIX_VISIBLE_LENGTH = 12;

export interface GeneratedApiKey {
  /** Chave crua. Mostrada UMA ÚNICA VEZ ao cliente — nunca persistida. */
  key: string;
  /** SHA-256 (hex) da chave crua. É isto que vai para o banco (api_key.key_hash). */
  keyHash: string;
  /** Primeiros 12 chars da chave. Visível/logável, usado para identificar a key. */
  keyPrefix: string;
}

/**
 * SHA-256 (hex) de uma chave. Usado tanto na geração quanto na validação:
 * o middleware recebe a key crua no header e compara o hash com api_key.key_hash.
 *
 * SHA-256 (e não bcrypt) é adequado aqui porque API keys são longas e de alta entropia
 * (32 chars base62 ≈ 190 bits), então não precisam de hashing lento contra brute force.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Gera uma nova API Key no formato `<prefix><32 chars base62>`
 * (ex: `3fc_live_aB3kP9...`). O prefixo vem do env (API_KEY_PREFIX).
 */
export function generateApiKey(prefix: string = env.API_KEY_PREFIX): GeneratedApiKey {
  let random = '';
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    // randomInt é criptograficamente seguro e sem viés de módulo.
    random += BASE62.charAt(randomInt(BASE62.length));
  }
  const key = `${prefix}${random}`;
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, PREFIX_VISIBLE_LENGTH),
  };
}
