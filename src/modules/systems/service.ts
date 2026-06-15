import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import type { CreateSystemInput, ListSystemsQuery, UpdateSystemInput } from './schema.js';

function buildWhere(query: ListSystemsQuery): Prisma.systemWhereInput {
  const where: Prisma.systemWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  return where;
}

export async function list(query: ListSystemsQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.system.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.system.count({ where }),
  ]);
  return { data, total };
}

export async function getById(id: number) {
  const found = await prisma.system.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Sistema com id ${id} não encontrado.`, { code: 'SYSTEM_NOT_FOUND' });
  }
  return found;
}

export async function create(input: CreateSystemInput) {
  const data: Prisma.systemUncheckedCreateInput = {
    name: input.name,
    description: input.description,
    link: input.link,
    logo_picture: input.logo_picture,
    is_active: input.is_active,
  };
  return prisma.system.create({ data });
}

export async function update(id: number, input: UpdateSystemInput) {
  const data: Prisma.systemUncheckedUpdateInput = { ...input };
  return prisma.system.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.system.delete({ where: { id } });
}
