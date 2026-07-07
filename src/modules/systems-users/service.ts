import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { toSkipTake, type PaginationQuery } from '../../utils/pagination.js';
import { assertSystemExists, assertUserExists } from '../../utils/references.js';

const USER_SAFE_OMIT = { password: true, profile_picture: true } as const;

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

/**
 * Vincula VÁRIOS usuários a um sistema numa única requisição (batch do `linkUser`).
 *
 * É **idempotente**: usuários já vinculados são simplesmente ignorados (não é 409,
 * diferente do link único) e devolvidos em `already_linked`. Valida o sistema e a
 * existência de TODOS os usuários antes de inserir — se algum id não existir, 404
 * `USER_NOT_FOUND` listando os que faltam (`details.missing`). Os vínculos criados
 * ficam com `role` nulo (igual ao link único; para definir role use o PUT).
 */
export async function linkUsers(systemId: number, userIds: number[]) {
  await assertSystemExists(systemId);

  const ids = [...new Set(userIds)];

  // Todos os usuários precisam existir — 404 limpo listando os ausentes.
  const found = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) {
    const foundSet = new Set(found.map((u) => u.id));
    const missing = ids.filter((id) => !foundSet.has(id)).sort((a, b) => a - b);
    throw new NotFoundError(`Usuário(s) não encontrado(s): ${missing.join(', ')}.`, {
      code: 'USER_NOT_FOUND',
      details: { missing },
    });
  }

  // Vínculos já existentes → ignorados (num batch não é conflito).
  const existing = await prisma.systems_users.findMany({
    where: { system_id: systemId, user_id: { in: ids } },
    select: { user_id: true },
  });
  const alreadySet = new Set(existing.map((e) => e.user_id));
  const toLink = ids.filter((id) => !alreadySet.has(id)).sort((a, b) => a - b);

  if (toLink.length > 0) {
    // skipDuplicates: guarda contra corrida com um link concorrente (o UNIQUE composto protege).
    await prisma.systems_users.createMany({
      data: toLink.map((user_id) => ({ system_id: systemId, user_id })),
      skipDuplicates: true,
    });
  }

  return {
    system_id: systemId,
    linked: toLink,
    already_linked: [...alreadySet].sort((a, b) => a - b),
    count: toLink.length,
  };
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

/**
 * Remove o acesso de VÁRIOS usuários a um sistema numa única requisição (batch do
 * `unlinkUser`).
 *
 * É **idempotente/tolerante**: usuário sem vínculo (ou id inexistente) **não** é erro
 * — remover é um no-op para ele, devolvido em `not_linked`. Não valida existência de
 * user de propósito: quem não existe simplesmente não tem vínculo a remover (mesmo
 * efeito prático). Valida só o sistema (404 `SYSTEM_NOT_FOUND`).
 */
export async function unlinkUsers(systemId: number, userIds: number[]) {
  await assertSystemExists(systemId);

  const ids = [...new Set(userIds)];

  // Quais dos ids realmente têm vínculo com este sistema.
  const existing = await prisma.systems_users.findMany({
    where: { system_id: systemId, user_id: { in: ids } },
    select: { user_id: true },
  });
  const linkedSet = new Set(existing.map((e) => e.user_id));
  const toUnlink = ids.filter((id) => linkedSet.has(id)).sort((a, b) => a - b);
  const notLinked = ids.filter((id) => !linkedSet.has(id)).sort((a, b) => a - b);

  if (toUnlink.length > 0) {
    await prisma.systems_users.deleteMany({
      where: { system_id: systemId, user_id: { in: toUnlink } },
    });
  }

  return {
    system_id: systemId,
    unlinked: toUnlink,
    not_linked: notLinked,
    count: toUnlink.length,
  };
}

/** Acessos do usuário — pivot { system_id, role } sem paginação. */
export async function getUserSystemAccess(
  userId: number,
): Promise<{ system_id: number; role: string | null }[]> {
  await assertUserExists(userId);
  return prisma.systems_users.findMany({
    where: { user_id: userId },
    select: { system_id: true, role: true },
    orderBy: { system_id: 'asc' },
  });
}

/**
 * Substitui completamente os acessos de um usuário em uma única transação.
 * Deduplica por system_id e valida existência de cada sistema antes de iniciar.
 */
export async function replaceUserSystems(
  userId: number,
  systems: { system_id: number; role: string | null }[],
): Promise<{ system_id: number; role: string | null }[]> {
  await assertUserExists(userId);
  const unique = [...new Map(systems.map((s) => [s.system_id, s])).values()];
  await Promise.all(unique.map((s) => assertSystemExists(s.system_id)));

  await prisma.$transaction(async (tx) => {
    await tx.systems_users.deleteMany({ where: { user_id: userId } });
    if (unique.length > 0) {
      await tx.systems_users.createMany({
        data: unique.map((s) => ({ system_id: s.system_id, user_id: userId, role: s.role })),
      });
    }
  });

  return prisma.systems_users.findMany({
    where: { user_id: userId },
    select: { system_id: true, role: true },
    orderBy: { system_id: 'asc' },
  });
}
