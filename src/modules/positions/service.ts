import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertDepartmentExists, assertUserExists } from '../../utils/references.js';
import type { CreatePositionInput, ListPositionsQuery, UpdatePositionInput } from './schema.js';

/**
 * Filtro INTERNO do service — desacoplado da query pública. `GET /positions` só
 * expõe `is_active` + paginação (convenção de params do CLAUDE.md); `department_id`
 * vem da rota dedicada `GET /departments/:id/positions`.
 */
export type PositionListFilters = ListPositionsQuery & { department_id?: number };

function buildWhere(query: PositionListFilters): Prisma.positionWhereInput {
  const where: Prisma.positionWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.department_id !== undefined) where.department_id = query.department_id;
  return where;
}

export async function list(query: PositionListFilters) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.position.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.position.count({ where }),
  ]);
  return { data, total };
}

/** Cargos de um departamento (rota `GET /departments/:id/positions`). */
export async function listByDepartment(departmentId: number, query: ListPositionsQuery) {
  await assertDepartmentExists(departmentId);
  return list({ ...query, department_id: departmentId });
}

export async function getById(id: number) {
  const found = await prisma.position.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Cargo com id ${id} não encontrado.`, { code: 'POSITION_NOT_FOUND' });
  }
  return found;
}

export async function create(input: CreatePositionInput) {
  if (input.created_by !== undefined)
    await assertUserExists(input.created_by, 'CREATED_BY_NOT_FOUND');
  if (input.department_id != null) await assertDepartmentExists(input.department_id);
  const data: Prisma.positionUncheckedCreateInput = {
    name: input.name,
    is_active: input.is_active,
    created_by: input.created_by,
    department_id: input.department_id,
  };
  return prisma.position.create({ data });
}

export async function update(id: number, input: UpdatePositionInput) {
  if (input.department_id != null) await assertDepartmentExists(input.department_id);
  const data: Prisma.positionUncheckedUpdateInput = { ...input };
  return prisma.position.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.position.delete({ where: { id } });
}
