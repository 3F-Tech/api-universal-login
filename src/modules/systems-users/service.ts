import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { toSkipTake, type PaginationQuery } from '../../utils/pagination.js';
import { assertSystemExists, assertUserExists } from '../../utils/references.js';

const USER_SAFE_OMIT = { password: true } as const;

/** Usuários vinculados a um sistema. */
export async function listSystemUsers(systemId: number, query: PaginationQuery) {
  await assertSystemExists(systemId);
  const where: Prisma.userWhereInput = { systems_users: { some: { system_id: systemId } } };
  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      omit: USER_SAFE_OMIT,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);
  return { data, total };
}

/** Vincula um usuário a um sistema. 409 se já existir. */
export async function linkUser(systemId: number, userId: number) {
  await assertSystemExists(systemId);
  await assertUserExists(userId);
  try {
    return await prisma.systems_users.create({ data: { system_id: systemId, user_id: userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('Usuário já vinculado a este sistema.', { code: 'ALREADY_LINKED' });
    }
    throw err;
  }
}

/** Desvincula um usuário de um sistema. 404 se não havia vínculo. */
export async function unlinkUser(systemId: number, userId: number) {
  const result = await prisma.systems_users.deleteMany({
    where: { system_id: systemId, user_id: userId },
  });
  if (result.count === 0) {
    throw new NotFoundError('Vínculo usuário-sistema não encontrado.', { code: 'LINK_NOT_FOUND' });
  }
  return { system_id: systemId, user_id: userId, deleted: true };
}

/** Sistemas a que um usuário tem acesso (visão inversa). */
export async function listUserSystems(userId: number, query: PaginationQuery) {
  await assertUserExists(userId);
  const where: Prisma.systemWhereInput = { systems_users: { some: { user_id: userId } } };
  const [data, total] = await Promise.all([
    prisma.system.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.system.count({ where }),
  ]);
  return { data, total };
}
