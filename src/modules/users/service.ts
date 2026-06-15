import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { hashPassword } from '../../utils/bcrypt.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './schema.js';

// Nunca devolvemos o hash da senha nas respostas.
const SAFE_OMIT = { password: true } as const;

function buildWhere(query: ListUsersQuery): Prisma.userWhereInput {
  const where: Prisma.userWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.bu_id !== undefined) where.bu_id = query.bu_id;
  if (query.squad_id !== undefined) where.squad_id = query.squad_id;
  if (query.department_id !== undefined) where.department_id = query.department_id;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q.toLowerCase() } },
    ];
  }
  return where;
}

export async function list(query: ListUsersQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.user.findMany({ where, omit: SAFE_OMIT, orderBy: { id: 'asc' }, ...toSkipTake(query) }),
    prisma.user.count({ where }),
  ]);
  return { data, total };
}

export async function getById(id: number) {
  const user = await prisma.user.findUnique({ where: { id }, omit: SAFE_OMIT });
  if (!user) {
    throw new NotFoundError(`Usuário com id ${id} não encontrado.`, { code: 'USER_NOT_FOUND' });
  }
  return user;
}

export async function create(input: CreateUserInput) {
  const data: Prisma.userUncheckedCreateInput = {
    ...input,
    password: await hashPassword(input.password),
  };
  return prisma.user.create({ data, omit: SAFE_OMIT });
}

export async function update(id: number, input: UpdateUserInput) {
  const data: Prisma.userUncheckedUpdateInput = { ...input };
  if (input.password) {
    data.password = await hashPassword(input.password);
  }
  // P2025 (não encontrado) é convertido em 404 pelo error-handler.
  return prisma.user.update({ where: { id }, data, omit: SAFE_OMIT });
}

export async function remove(id: number): Promise<void> {
  await prisma.user.delete({ where: { id } });
}
