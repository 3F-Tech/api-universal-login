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

/**
 * Lista sistemas já com suas BUs embutidas (campo `bus`) numa quantidade FIXA de
 * queries — não cresce com o número de sistemas: 1 para os sistemas da página,
 * 1 para os vínculos (pivot) e 1 para as BUs. Substitui o padrão N+1 em que o
 * front chamava GET /systems/:id/bus uma vez por sistema.
 *
 * Usa só campos escalares + filtros `where ... in` (sem include de relação),
 * conforme a convenção do projeto.
 */
export async function listWithBus(query: ListSystemsQuery) {
  const where = buildWhere(query);
  const [systems, total] = await Promise.all([
    prisma.system.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.system.count({ where }),
  ]);

  const systemIds = systems.map((s) => s.id);

  // Vínculos + dados da BU numa ÚNICA query (join pelo pivot). `bu` é a relação
  // FK direta do pivot (nome limpo, não as relações desambiguadas frágeis), então
  // o select é seguro. O `where` usa a PK composta (system_id, bu_id).
  const links = systemIds.length
    ? await prisma.systems_bus.findMany({
        where: { system_id: { in: systemIds } },
        select: { system_id: true, bu: true },
      })
    : [];

  // Agrupa as BUs por sistema em memória.
  type LinkedBu = (typeof links)[number]['bu'];
  const busBySystem = new Map<number, LinkedBu[]>();
  for (const link of links) {
    const arr = busBySystem.get(link.system_id) ?? [];
    arr.push(link.bu);
    busBySystem.set(link.system_id, arr);
  }
  // Ordena as BUs de cada sistema por nome.
  for (const arr of busBySystem.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const data = systems.map((s) => ({ ...s, bus: busBySystem.get(s.id) ?? [] }));
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
