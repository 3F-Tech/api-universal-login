import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertUserExists } from '../../utils/references.js';
import type { CreatePositionInput, ListPositionsQuery, UpdatePositionInput } from './schema.js';

function buildWhere(query: ListPositionsQuery): Prisma.positionWhereInput {
  const where: Prisma.positionWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  return where;
}

export async function list(query: ListPositionsQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.position.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.position.count({ where }),
  ]);
  return { data, total };
}

export async function getById(id: number) {
  const found = await prisma.position.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Cargo com id ${id} não encontrado.`, { code: 'POSITION_NOT_FOUND' });
  }
  return found;
}

export async function create(input: CreatePositionInput) {
  if (input.created_by !== undefined) await assertUserExists(input.created_by, 'CREATED_BY_NOT_FOUND');
  const data: Prisma.positionUncheckedCreateInput = {
    name: input.name,
    is_active: input.is_active,
    created_by: input.created_by,
  };
  return prisma.position.create({ data });
}

export async function update(id: number, input: UpdatePositionInput) {
  const data: Prisma.positionUncheckedUpdateInput = { ...input };
  return prisma.position.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.position.delete({ where: { id } });
}
