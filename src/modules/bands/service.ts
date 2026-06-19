import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertUserExists } from '../../utils/references.js';
import type { CreateBandInput, ListBandsQuery, UpdateBandInput } from './schema.js';

function buildWhere(query: ListBandsQuery): Prisma.bandWhereInput {
  const where: Prisma.bandWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  return where;
}

export async function list(query: ListBandsQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    // bands têm ordem natural por sort_order.
    prisma.band.findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.band.count({ where }),
  ]);
  return { data, total };
}

export async function getById(id: number) {
  const found = await prisma.band.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Band com id ${id} não encontrada.`, { code: 'BAND_NOT_FOUND' });
  }
  return found;
}

export async function create(input: CreateBandInput) {
  if (input.created_by !== undefined) await assertUserExists(input.created_by, 'CREATED_BY_NOT_FOUND');
  const data: Prisma.bandUncheckedCreateInput = {
    name: input.name,
    color_hex: input.color_hex,
    icon: input.icon,
    sort_order: input.sort_order,
    is_active: input.is_active,
    created_by: input.created_by,
  };
  return prisma.band.create({ data });
}

export async function update(id: number, input: UpdateBandInput) {
  const data: Prisma.bandUncheckedUpdateInput = { ...input };
  return prisma.band.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.band.delete({ where: { id } });
}
