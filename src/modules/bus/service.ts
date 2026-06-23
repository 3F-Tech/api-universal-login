import { Prisma, type bu } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertBuExists } from '../../utils/references.js';
import type { CreateBuInput, ListBusQuery, UpdateBuInput } from './schema.js';

export interface BuTreeNode extends bu {
  children: BuTreeNode[];
}

function buildWhere(query: ListBusQuery): Prisma.buWhereInput {
  const where: Prisma.buWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.parent_id !== undefined) where.parent_id = query.parent_id;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q.toLowerCase() } },
    ];
  }
  return where;
}

export async function list(query: ListBusQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.bu.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.bu.count({ where }),
  ]);
  return { data, total };
}

/** Árvore hierárquica completa (raízes = parent_id null) montada em memória. */
export async function tree(): Promise<BuTreeNode[]> {
  const all = await prisma.bu.findMany({ orderBy: { name: 'asc' } });
  const nodes = new Map<number, BuTreeNode>();
  for (const b of all) nodes.set(b.id, { ...b, children: [] });

  const roots: BuTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id !== null ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function getById(id: number) {
  const found = await prisma.bu.findUnique({ where: { id } });
  if (!found) throw new NotFoundError(`BU com id ${id} não encontrada.`, { code: 'BU_NOT_FOUND' });
  return found;
}

export async function create(input: CreateBuInput) {
  if (input.parent_id != null) await assertBuExists(input.parent_id);
  const data: Prisma.buUncheckedCreateInput = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    primary_color_hex: input.primary_color_hex,
    secondary_color_hex: input.secondary_color_hex,
    parent_id: input.parent_id,
    logo_picture: input.logo_picture,
    is_active: input.is_active,
  };
  return prisma.bu.create({ data });
}

export async function update(id: number, input: UpdateBuInput) {
  if (input.parent_id != null) {
    if (input.parent_id === id) {
      throw new ValidationError('Uma BU não pode ser pai dela mesma.', { code: 'INVALID_PARENT' });
    }
    await assertBuExists(input.parent_id);
  }
  const data: Prisma.buUncheckedUpdateInput = { ...input };
  return prisma.bu.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.bu.delete({ where: { id } });
}
