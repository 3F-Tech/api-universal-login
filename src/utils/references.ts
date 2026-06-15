import { prisma } from '../config/database.js';
import { NotFoundError } from './errors.js';

/**
 * Valida a existência de FKs ANTES de inserir/atualizar, para devolver um erro
 * 404 limpo em vez de deixar a constraint do banco estourar um P2003 genérico.
 * Usado principalmente para `created_by` / `leader_id` (referências a user).
 */
export async function assertUserExists(id: number, code = 'USER_NOT_FOUND'): Promise<void> {
  const found = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!found) {
    throw new NotFoundError(`Usuário com id ${id} não encontrado.`, { code });
  }
}

export async function assertSystemExists(id: number): Promise<void> {
  const found = await prisma.system.findUnique({ where: { id }, select: { id: true } });
  if (!found) {
    throw new NotFoundError(`Sistema com id ${id} não encontrado.`, { code: 'SYSTEM_NOT_FOUND' });
  }
}

export async function assertBuExists(id: number): Promise<void> {
  const found = await prisma.bu.findUnique({ where: { id }, select: { id: true } });
  if (!found) {
    throw new NotFoundError(`BU com id ${id} não encontrada.`, { code: 'BU_NOT_FOUND' });
  }
}
