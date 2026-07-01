import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { hashPassword } from '../../utils/bcrypt.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { assertBuExists, assertUserExists } from '../../utils/references.js';
import { toSkipTake, type PaginationQuery } from '../../utils/pagination.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './schema.js';

/**
 * Filtros INTERNOS do service — desacoplados da query pública. A rota `GET /users`
 * só expõe `is_active` + paginação (convenção de params do CLAUDE.md), mas o service
 * mantém filtros por `squad_id` e `leader_id` porque as ROTAS `GET /squads/:id/users`
 * e `GET /users/:id/led` delegam para cá. Novos filtros entram aqui quando viram rotas.
 */
export type UserListFilters = PaginationQuery & {
  is_active?: boolean;
  squad_id?: number;
  leader_id?: number;
};

// Nunca devolvemos o hash da senha nas respostas.
const SAFE_OMIT = { password: true } as const;

// Na LISTAGEM omitimos TAMBÉM profile_picture: são imagens base64 (média ~1,6 MB,
// chegando a 2,5 MB) que sozinhas levavam o GET /users a ~5,5 s. O front busca as
// fotos da página visível à parte, via GET /users/photos?ids=... (listPhotos).
// getById/create/update continuam com SAFE_OMIT (a tela de detalhe quer a foto).
const LIST_OMIT = { password: true, profile_picture: true } as const;

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
 * BUs de VÁRIOS usuários em exatamente 2 queries (evita N+1 na listagem).
 * Não usa relação no select: com adapter-pg o Prisma dispara uma query por
 * linha de users_bus ao resolver a FK bu_id → bu, o que causava ~50 round-trips.
 */
async function fetchBusByUser(userIds: number[]) {
  if (userIds.length === 0) return new Map<number, Awaited<ReturnType<typeof fetchUserBus>>>();

  // Query 1: vínculos (só campos escalares — sem relação)
  const links = await prisma.users_bus.findMany({
    where: { user_id: { in: userIds } },
    select: { user_id: true, bu_id: true, from_squad: true },
    orderBy: { bu_id: 'asc' },
  });

  // Query 2: BUs únicas em batch
  const buIds = [...new Set(links.map((l) => l.bu_id))];
  const bus = buIds.length ? await prisma.bu.findMany({ where: { id: { in: buIds } } }) : [];
  const buMap = new Map(bus.map((b) => [b.id, b]));

  const map = new Map<number, Awaited<ReturnType<typeof fetchUserBus>>>();
  for (const { user_id, bu_id, from_squad } of links) {
    const bu = buMap.get(bu_id);
    if (!bu) continue;
    const arr = map.get(user_id) ?? [];
    arr.push({ ...bu, from_squad });
    map.set(user_id, arr);
  }
  return map;
}

function buildWhere(query: UserListFilters): Prisma.userWhereInput {
  const where: Prisma.userWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  // squad_id e leader_id não são params públicos: vêm de rotas dedicadas
  // (GET /squads/:id/users e GET /users/:id/led) por delegação.
  if (query.squad_id !== undefined) where.squad_id = query.squad_id;
  if (query.leader_id !== undefined) where.leader_id = query.leader_id;
  return where;
}

export async function list(query: UserListFilters) {
  const where = buildWhere(query);
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, omit: LIST_OMIT, orderBy: { id: 'asc' }, ...toSkipTake(query) }),
    prisma.user.count({ where }),
  ]);

  // Embute as BUs de cada usuário numa query só (sem N+1).
  const busByUser = await fetchBusByUser(users.map((u) => u.id));
  const data = users.map((u) => ({ ...u, bus: busByUser.get(u.id) ?? [] }));

  return { data, total };
}

/**
 * Fotos de perfil em lote, por ids. Devolve um mapa `{ [id]: profile_picture }`
 * só com os usuários que existem (a foto em si pode ser `null`). Ids inexistentes
 * simplesmente não aparecem no mapa. Uma query, sem N+1.
 *
 * Contrapartida do LIST_OMIT: a lista vem leve e rápida; as fotos chegam aqui,
 * sob demanda, para a página visível ou para os resultados de uma busca.
 */
export async function listPhotos(ids: number[]): Promise<Record<number, string | null>> {
  if (ids.length === 0) return {};
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, profile_picture: true },
  });
  const map: Record<number, string | null> = {};
  for (const r of rows) map[r.id] = r.profile_picture;
  return map;
}

/**
 * Usuários LIDERADOS por um usuário (filtra por `user.leader_id`). Valida o líder
 * (404 limpo) e delega para `list` — então já vem paginado, LEVE (sem
 * `profile_picture`) e com `bus` embutido, idêntico ao `GET /users`. As fotos
 * vêm à parte por `GET /users/photos?ids=...`, no mesmo fluxo da listagem.
 */
export async function listLed(leaderId: number, query: ListUsersQuery) {
  await assertUserExists(leaderId, 'LEADER_NOT_FOUND');
  return list({ ...query, leader_id: leaderId });
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
  // Valida FKs antes (404 limpo em vez de P2003 da constraint).
  if (userData.leader_id != null) await assertUserExists(userData.leader_id, 'LEADER_NOT_FOUND');
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
  // leader_id: não pode ser o próprio usuário; se informado, precisa existir.
  // (Guarda só o auto-ciclo direto — igual ao parent_id de BU; não detecta ciclos profundos.)
  if (userData.leader_id != null) {
    if (userData.leader_id === id) {
      throw new ValidationError('Um usuário não pode ser líder de si mesmo.', {
        code: 'INVALID_LEADER',
      });
    }
    await assertUserExists(userData.leader_id, 'LEADER_NOT_FOUND');
  }
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
