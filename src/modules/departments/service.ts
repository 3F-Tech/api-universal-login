import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertUserExists } from '../../utils/references.js';
import type {
  CreateDepartmentInput,
  ListDepartmentsQuery,
  UpdateDepartmentInput,
} from './schema.js';

function buildWhere(query: ListDepartmentsQuery): Prisma.departmentWhereInput {
  const where: Prisma.departmentWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  return where;
}

export async function list(query: ListDepartmentsQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.department.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.department.count({ where }),
  ]);
  return { data, total };
}

export async function getById(id: number) {
  const found = await prisma.department.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Departamento com id ${id} não encontrado.`, {
      code: 'DEPARTMENT_NOT_FOUND',
    });
  }
  return found;
}

export async function create(input: CreateDepartmentInput) {
  await assertUserExists(input.created_by, 'CREATED_BY_NOT_FOUND');
  const data: Prisma.departmentUncheckedCreateInput = {
    name: input.name,
    icon: input.icon,
    is_active: input.is_active,
    created_by: input.created_by,
  };
  return prisma.department.create({ data });
}

export async function update(id: number, input: UpdateDepartmentInput) {
  const data: Prisma.departmentUncheckedUpdateInput = { ...input };
  return prisma.department.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.department.delete({ where: { id } });
}
