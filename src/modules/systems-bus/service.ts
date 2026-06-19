import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { toSkipTake, type PaginationQuery } from '../../utils/pagination.js';
import { assertBuExists, assertSystemExists } from '../../utils/references.js';

/** BUs vinculadas a um sistema. */
export async function listSystemBus(systemId: number, query: PaginationQuery) {
  await assertSystemExists(systemId);
  const where: Prisma.buWhereInput = { systems_bus: { some: { system_id: systemId } } };
  const [data, total] = await Promise.all([
    prisma.bu.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.bu.count({ where }),
  ]);
  return { data, total };
}

/** Vincula uma BU a um sistema. 409 se já existir. */
export async function linkBu(systemId: number, buId: number) {
  await assertSystemExists(systemId);
  await assertBuExists(buId);
  try {
    return await prisma.systems_bus.create({ data: { system_id: systemId, bu_id: buId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('BU já vinculada a este sistema.', { code: 'ALREADY_LINKED' });
    }
    throw err;
  }
}

/** Desvincula uma BU de um sistema. 404 se não havia vínculo. */
export async function unlinkBu(systemId: number, buId: number) {
  const result = await prisma.systems_bus.deleteMany({
    where: { system_id: systemId, bu_id: buId },
  });
  if (result.count === 0) {
    throw new NotFoundError('Vínculo BU-sistema não encontrado.', { code: 'LINK_NOT_FOUND' });
  }
  return { system_id: systemId, bu_id: buId, deleted: true };
}

/** bu_ids vinculadas a um sistema — lista completa sem paginação (pivot). */
export async function getSystemBuIds(systemId: number): Promise<{ bu_id: number }[]> {
  await assertSystemExists(systemId);
  return prisma.systems_bus.findMany({
    where: { system_id: systemId },
    select: { bu_id: true },
    orderBy: { bu_id: 'asc' },
  });
}

/**
 * Substitui completamente as BUs de um sistema em uma única transação.
 * Deduplica bu_ids e valida existência de cada BU antes de iniciar.
 */
export async function replaceSystemBus(
  systemId: number,
  buIds: number[],
): Promise<{ bu_id: number }[]> {
  await assertSystemExists(systemId);
  const uniqueIds = [...new Set(buIds)];
  await Promise.all(uniqueIds.map(assertBuExists));

  return prisma.$transaction(async (tx) => {
    await tx.systems_bus.deleteMany({ where: { system_id: systemId } });
    if (uniqueIds.length > 0) {
      await tx.systems_bus.createMany({
        data: uniqueIds.map((bu_id) => ({ system_id: systemId, bu_id })),
      });
    }
    return tx.systems_bus.findMany({
      where: { system_id: systemId },
      select: { bu_id: true },
      orderBy: { bu_id: 'asc' },
    });
  });
}

/** Sistemas vinculados a uma BU (visão inversa). */
export async function listBuSystems(buId: number, query: PaginationQuery) {
  await assertBuExists(buId);
  const where: Prisma.systemWhereInput = { systems_bus: { some: { bu_id: buId } } };
  const [data, total] = await Promise.all([
    prisma.system.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.system.count({ where }),
  ]);
  return { data, total };
}
