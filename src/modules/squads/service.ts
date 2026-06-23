import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake, type PaginationQuery } from '../../utils/pagination.js';
import { assertBuExists, assertSquadExists, assertUserExists } from '../../utils/references.js';
import * as usersService from '../users/service.js';
import type { CreateSquadInput, ListSquadsQuery, UpdateSquadInput } from './schema.js';

function buildWhere(query: ListSquadsQuery): Prisma.squadWhereInput {
  const where: Prisma.squadWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.bu_id !== undefined) where.bu_id = query.bu_id;
  if (query.leader_id !== undefined) where.leader_id = query.leader_id;
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  return where;
}

export async function list(query: ListSquadsQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.squad.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.squad.count({ where }),
  ]);
  return { data, total };
}

export async function getById(id: number) {
  const found = await prisma.squad.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Squad com id ${id} não encontrado.`, { code: 'SQUAD_NOT_FOUND' });
  }
  return found;
}

/**
 * Usuários de um squad (via user.squad_id). Valida o squad (404 limpo) e delega
 * para a listagem de users — então já vem paginado e com as BUs (`bus`) embutidas.
 */
export async function listUsers(squadId: number, query: PaginationQuery) {
  await assertSquadExists(squadId);
  return usersService.list({ ...query, squad_id: squadId });
}

export async function create(input: CreateSquadInput) {
  await assertUserExists(input.leader_id, 'LEADER_NOT_FOUND');
  if (input.bu_id != null) await assertBuExists(input.bu_id);

  const data: Prisma.squadUncheckedCreateInput = {
    name: input.name,
    description: input.description,
    picture: input.picture,
    leader_id: input.leader_id,
    bu_id: input.bu_id,
    is_active: input.is_active,
  };
  return prisma.squad.create({ data });
}

export async function update(id: number, input: UpdateSquadInput) {
  if (input.leader_id !== undefined) await assertUserExists(input.leader_id, 'LEADER_NOT_FOUND');
  if (input.bu_id != null) await assertBuExists(input.bu_id);

  const data: Prisma.squadUncheckedUpdateInput = { ...input };
  return prisma.squad.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.squad.delete({ where: { id } });
}
