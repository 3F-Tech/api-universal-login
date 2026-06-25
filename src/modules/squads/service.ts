import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake, type PaginationQuery } from '../../utils/pagination.js';
import { assertBuExists, assertSquadExists, assertUserExists } from '../../utils/references.js';
import * as usersService from '../users/service.js';
import type { CreateSquadInput, ListSquadsQuery, UpdateSquadInput } from './schema.js';

/** Linha mínima de squad usada para calcular a contagem de membros. */
type SquadForCount = { id: number; leader_id: number | null };

/**
 * Contagem de membros de VÁRIOS squads numa quantidade FIXA de queries (sem N+1):
 * 1 `groupBy` dos membros ativos + 1 `findMany` dos líderes. Não cresce com o nº
 * de squads nem de funcionários.
 *
 * Definição (decisão travada): `membros = { user.squad_id == squad.id, ativos } ∪ { líder }`.
 * O líder entra sempre na contagem, mesmo que esteja inativo ou com `squad_id`
 * divergente — só não é somado duas vezes quando já é membro ativo do squad.
 */
async function memberCountBySquad(squads: SquadForCount[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (squads.length === 0) return result;

  const squadIds = squads.map((s) => s.id);

  // Membros ATIVOS por squad (ignora a linha sem squad_id, que o Prisma agrupa como null).
  const grouped = await prisma.user.groupBy({
    by: ['squad_id'],
    where: { squad_id: { in: squadIds }, is_active: true },
    _count: { _all: true },
  });
  const activeCount = new Map<number, number>();
  for (const g of grouped) {
    if (g.squad_id != null) activeCount.set(g.squad_id, g._count._all);
  }

  // Líderes dos squads da página — para saber se já caem no conjunto de membros ativos.
  const leaderIds = [
    ...new Set(squads.map((s) => s.leader_id).filter((x): x is number => x != null)),
  ];
  const leaders = leaderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: leaderIds } },
        select: { id: true, squad_id: true, is_active: true },
      })
    : [];
  const leaderById = new Map(leaders.map((l) => [l.id, l]));

  for (const s of squads) {
    let count = activeCount.get(s.id) ?? 0;
    if (s.leader_id != null) {
      const leader = leaderById.get(s.leader_id);
      // Soma o líder a menos que ele já seja membro ativo deste squad (evita dupla contagem).
      const alreadyCounted = leader != null && leader.is_active && leader.squad_id === s.id;
      if (leader != null && !alreadyCounted) count += 1;
    }
    result.set(s.id, count);
  }
  return result;
}

function buildWhere(query: ListSquadsQuery): Prisma.squadWhereInput {
  const where: Prisma.squadWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  return where;
}

export async function list(query: ListSquadsQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.squad.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
    prisma.squad.count({ where }),
  ]);
  return { data, total };
}

/**
 * Idêntico a `list`, mas embute `member_count` em cada squad (ver `memberCountBySquad`).
 *
 * ⚠️ ESTACIONADO: sem chamador desde que o param `?include=member_count` foi removido
 * (convenção de params do CLAUDE.md). Pronto para religar quando a contagem virar uma
 * rota dedicada (ex.: `GET /squads/member-counts`). Não remover.
 */
export async function listWithMemberCount(query: ListSquadsQuery) {
  const { data, total } = await list(query);
  const counts = await memberCountBySquad(data);
  return { data: data.map((s) => ({ ...s, member_count: counts.get(s.id) ?? 0 })), total };
}

export async function getById(id: number) {
  const found = await prisma.squad.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Squad com id ${id} não encontrado.`, { code: 'SQUAD_NOT_FOUND' });
  }
  return found;
}

/** Idêntico a `getById`, mas embute `member_count` no squad. */
export async function getByIdWithMemberCount(id: number) {
  const squad = await getById(id);
  const counts = await memberCountBySquad([squad]);
  return { ...squad, member_count: counts.get(id) ?? 0 };
}

/**
 * Usuários de um squad (via user.squad_id). Valida o squad (404 limpo) e delega
 * para a listagem de users — então já vem paginado e com as BUs (`bus`) embutidas.
 */
export async function listUsers(squadId: number, query: PaginationQuery) {
  await assertSquadExists(squadId);
  return usersService.list({ ...query, squad_id: squadId });
}

/**
 * Membros de um squad em formato ENXUTO e já RESOLVIDO (nomes, não ids) — para o
 * front renderizar o card sem cruzar /positions, /bands, /departments.
 *
 * Conjunto = `{ membros ativos (user.squad_id == squad.id) } ∪ { líder }` (mesma
 * definição de `memberCountBySquad`, então `total` aqui == `member_count` da
 * Mudança 1). O líder vem sempre (mesmo inativo) e é flutuado para o topo da
 * página com `is_leader: true`.
 *
 * Custo fixo (não cresce com o nº de membros): 1 query de membros + 1 `count` +
 * 1 por tabela de referência (position/band/department, via `id in […]`) + 1 de
 * vínculos `users_bus`. Sem `include` de relação frágil (segue a convenção do projeto).
 */
export async function listMembers(squadId: number, query: PaginationQuery) {
  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { id: true, leader_id: true },
  });
  if (!squad) {
    throw new NotFoundError(`Squad com id ${squadId} não encontrado.`, { code: 'SQUAD_NOT_FOUND' });
  }

  // Membros ativos do squad ∪ o líder (sempre, mesmo inativo/divergente).
  const where: Prisma.userWhereInput =
    squad.leader_id != null
      ? { OR: [{ squad_id: squadId, is_active: true }, { id: squad.leader_id }] }
      : { squad_id: squadId, is_active: true };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
      select: {
        id: true,
        name: true,
        email: true,
        profile_picture: true,
        position_id: true,
        band_id: true,
        department_id: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Referências em lote (id in […]) — uma query por tabela, mapeadas em memória.
  const distinct = (ids: (number | null)[]) => [
    ...new Set(ids.filter((x): x is number => x != null)),
  ];
  const positionIds = distinct(users.map((u) => u.position_id));
  const bandIds = distinct(users.map((u) => u.band_id));
  const departmentIds = distinct(users.map((u) => u.department_id));

  const [positions, bands, departments, busByUser] = await Promise.all([
    positionIds.length
      ? prisma.position.findMany({
          where: { id: { in: positionIds } },
          select: { id: true, name: true },
        })
      : [],
    bandIds.length
      ? prisma.band.findMany({
          where: { id: { in: bandIds } },
          select: { id: true, name: true, color_hex: true, icon: true },
        })
      : [],
    departmentIds.length
      ? prisma.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, name: true, icon: true },
        })
      : [],
    fetchMemberBus(users.map((u) => u.id)),
  ]);

  const positionById = new Map(positions.map((p) => [p.id, p]));
  const bandById = new Map(bands.map((b) => [b.id, b]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  const data = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    profile_picture: u.profile_picture,
    position: u.position_id != null ? (positionById.get(u.position_id) ?? null) : null,
    band: u.band_id != null ? (bandById.get(u.band_id) ?? null) : null,
    department: u.department_id != null ? (departmentById.get(u.department_id) ?? null) : null,
    bus: busByUser.get(u.id) ?? [],
    is_leader: u.id === squad.leader_id,
  }));

  // Líder no topo da página (Array.sort é estável no V8 → mantém name asc no resto).
  data.sort((a, b) => Number(b.is_leader) - Number(a.is_leader));

  return { data, total };
}

type MemberBu = {
  id: number;
  name: string;
  slug: string;
  primary_color_hex: string | null;
  from_squad: boolean;
};

/** BUs enxutas por usuário em exatamente 2 queries (sem relação no select — evita N+1). */
async function fetchMemberBus(userIds: number[]): Promise<Map<number, MemberBu[]>> {
  const map = new Map<number, MemberBu[]>();
  if (userIds.length === 0) return map;

  // Query 1: vínculos (escalares apenas)
  const links = await prisma.users_bus.findMany({
    where: { user_id: { in: userIds } },
    orderBy: { bu_id: 'asc' },
    select: { user_id: true, bu_id: true, from_squad: true },
  });

  // Query 2: BUs únicas em batch
  const buIds = [...new Set(links.map((l) => l.bu_id))];
  if (buIds.length === 0) return map;
  const bus = await prisma.bu.findMany({
    where: { id: { in: buIds } },
    select: { id: true, name: true, slug: true, primary_color_hex: true },
  });
  const buMap = new Map(bus.map((b) => [b.id, b]));

  for (const { user_id, bu_id, from_squad } of links) {
    const bu = buMap.get(bu_id);
    if (!bu) continue;
    const arr = map.get(user_id) ?? [];
    arr.push({ ...bu, from_squad });
    map.set(user_id, arr);
  }
  return map;
}

export async function create(input: CreateSquadInput) {
  await assertUserExists(input.leader_id, 'LEADER_NOT_FOUND');
  if (input.bu_id != null) await assertBuExists(input.bu_id);

  const data: Prisma.squadUncheckedCreateInput = {
    name: input.name,
    description: input.description,
    picture: input.picture,
    leader_id: input.leader_id,
    bu_id: input.bu_id,
    is_active: input.is_active,
  };
  return prisma.squad.create({ data });
}

export async function update(id: number, input: UpdateSquadInput) {
  if (input.leader_id !== undefined) await assertUserExists(input.leader_id, 'LEADER_NOT_FOUND');
  if (input.bu_id != null) await assertBuExists(input.bu_id);

  const data: Prisma.squadUncheckedUpdateInput = { ...input };
  return prisma.squad.update({ where: { id }, data });
}

export async function remove(id: number): Promise<void> {
  await prisma.squad.delete({ where: { id } });
}
