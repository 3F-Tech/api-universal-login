import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

/**
 * Gera o hash bcrypt de uma senha de usuário.
 * O cost factor vem do env (padrão 12) — nunca hardcode.
 */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_COST);
}

/**
 * Compara uma senha em texto puro com um hash bcrypt.
 * Retorna false (em vez de lançar) quando o hash é inválido/legado.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
