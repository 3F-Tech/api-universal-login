import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { hashPassword } from '../../utils/bcrypt.js';
import { NotFoundError } from '../../utils/errors.js';
import { assertBuExists } from '../../utils/references.js';
import { toSkipTake } from '../../utils/pagination.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './schema.js';

// Nunca devolvemos o hash da senha nas respostas.
const SAFE_OMIT = { password: true } as const;

/** Tipo do client dentro de uma transação (mesma superfície do prisma global). */
type TxClient = Prisma.TransactionClient;

type BusLink = { bu_id: number; from_squad: boolean };

/** Deduplica vínculos por bu_id (último vence) — evita violar o UNIQUE (user_id, bu_id). */
function normalizeBus(bus: BusLink[]): BusLink[] {
  const map = new Map<number, boolean>();
  for (const link of bus) map.set(link.bu_id, link.from_squad);
  return [...map].map(([bu_id, from_squad]) => ({ bu_id, from_squad }));
}

/** BUs do usuário, cada uma com o flag from_squad do vínculo. */
async function fetchUserBus(client: TxClient, userId: number) {
  const links = await client.users_bus.findMany({
    where: { user_id: userId },
    select: { from_squad: true, bu: true },
    orderBy: { bu_id: 'asc' },
  });
  return links.map(({ bu, from_squad }) => ({ ...bu, from_squad }));
}

/**
 * BUs de VÁRIOS usuários numa única query (evita N+1 na listagem). Retorna um
 * Map user_id → BUs[] (cada BU com from_squad).
 */
async function fetchBusByUser(userIds: number[]) {
  if (userIds.length === 0) return new Map<number, Awaited<ReturnType<typeof fetchUserBus>>>();
  const links = await prisma.users_bus.findMany({
    where: { user_id: { in: userIds } },
    select: { user_id: true, from_squad: true, bu: true },
    orderBy: { bu_id: 'asc' },
  });
  const map = new Map<number, Awaited<ReturnType<typeof fetchUserBus>>>();
  for (const { user_id, bu, from_squad } of links) {
    const arr = map.get(user_id) ?? [];
    arr.push({ ...bu, from_squad });
    map.set(user_id, arr);
  }
  return map;
}

function buildWhere(query: ListUsersQuery): Prisma.userWhereInput {
  const where: Prisma.userWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  // bu_id agora é N:N — filtra usuários vinculados àquela BU via pivot.
  if (query.bu_id !== undefined) where.users_bus = { some: { bu_id: query.bu_id } };
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
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, omit: SAFE_OMIT, orderBy: { id: 'asc' }, ...toSkipTake(query) }),
    prisma.user.count({ where }),
  ]);

  // Embute as BUs de cada usuário numa query só (sem N+1).
  const busByUser = await fetchBusByUser(users.map((u) => u.id));
  const data = users.map((u) => ({ ...u, bus: busByUser.get(u.id) ?? [] }));

  return { data, total };
}

export async function getById(id: number) {
  const user = await prisma.user.findUnique({ where: { id }, omit: SAFE_OMIT });
  if (!user) {
    throw new NotFoundError(`Usuário com id ${id} não encontrado.`, { code: 'USER_NOT_FOUND' });
  }
  return { ...user, bus: await fetchUserBus(prisma, id) };
}

export async function create(input: CreateUserInput) {
  const { bus, ...userData } = input;
  const links = bus ? normalizeBus(bus) : [];
  // Valida cada BU antes (404 limpo em vez de P2003 da constraint).
  await Promise.all(links.map((l) => assertBuExists(l.bu_id)));
  const password = await hashPassword(userData.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { ...userData, password }, omit: SAFE_OMIT });
    if (links.length > 0) {
      await tx.users_bus.createMany({
        data: links.map((l) => ({ user_id: user.id, bu_id: l.bu_id, from_squad: l.from_squad })),
      });
    }
    return { ...user, bus: await fetchUserBus(tx, user.id) };
  });
}

export async function update(id: number, input: UpdateUserInput) {
  const { bus, ...userData } = input;
  const data: Prisma.userUncheckedUpdateInput = { ...userData };
  if (userData.password) {
    data.password = await hashPassword(userData.password);
  }
  // bus ausente → não mexe nos vínculos; presente → substitui o conjunto inteiro.
  const links = bus === undefined ? undefined : normalizeBus(bus);
  if (links) await Promise.all(links.map((l) => assertBuExists(l.bu_id)));

  return prisma.$transaction(async (tx) => {
    // P2025 (não encontrado) é convertido em 404 pelo error-handler.
    const user = await tx.user.update({ where: { id }, data, omit: SAFE_OMIT });
    if (links !== undefined) {
      await tx.users_bus.deleteMany({ where: { user_id: id } });
      if (links.length > 0) {
        await tx.users_bus.createMany({
          data: links.map((l) => ({ user_id: id, bu_id: l.bu_id, from_squad: l.from_squad })),
        });
      }
    }
    return { ...user, bus: await fetchUserBus(tx, id) };
  });
}

export async function remove(id: number): Promise<void> {
  // users_bus tem ON DELETE CASCADE — os vínculos somem junto.
  await prisma.user.delete({ where: { id } });
}
