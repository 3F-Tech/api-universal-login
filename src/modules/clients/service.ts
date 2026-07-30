import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake, type PaginationQuery } from '../../utils/pagination.js';
import { assertSquadExists, assertUserExists } from '../../utils/references.js';
import type {
  CreateClientInput,
  ListClientsQuery,
  SearchClientsQuery,
  UpdateClientInput,
} from './schema.js';

// logo_picture ainda é base64 inline (mesmo problema de user.profile_picture) — nunca
// sai em listagem/busca/batch, só no getById (ver rule.md).
const LIST_OMIT = { logo_picture: true } as const;

/**
 * `client.id` é BigInt (bigserial) no banco, mas a sequence está em ~298 hoje — bem
 * abaixo de Number.MAX_SAFE_INTEGER. Convertido para Number na saída para manter a
 * API consistente com todo o resto da Core (todo outro `id` é numérico), diferente do
 * BigInt de `systems_users_access.id` (log interno, sem FK cross-sistema): o
 * `client.id` É referenciado como FK inteira normal em `contracts`/`contract_churns`/
 * `spiced` no sistema_gestao, então expor como number (não string) é o que os
 * consumidores esperam.
 */
function serialize<T extends { id: bigint }>(row: T): Omit<T, 'id'> & { id: number } {
  return { ...row, id: Number(row.id) };
}

function buildWhere(query: ListClientsQuery): Prisma.clientWhereInput {
  const where: Prisma.clientWhereInput = {};
  if (query.is_active !== undefined) where.is_active = query.is_active;
  return where;
}

export async function list(query: ListClientsQuery) {
  const where = buildWhere(query);
  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      omit: LIST_OMIT,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.client.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}

export async function getById(id: number) {
  const found = await prisma.client.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundError(`Cliente com id ${id} não encontrado.`, { code: 'CLIENT_NOT_FOUND' });
  }
  return serialize(found);
}

/** Lookup pela chave natural (document é UNIQUE). Precisa bater exatamente com o valor
 * armazenado (com pontuação) — o chamador deve enviar o segmento URL-encoded, já que
 * documento de PJ costuma conter "/" (ex.: CNPJ `00.000.000/0001-00`). */
export async function getByDocument(document: string) {
  const found = await prisma.client.findUnique({ where: { document } });
  if (!found) {
    throw new NotFoundError(`Cliente com document "${document}" não encontrado.`, {
      code: 'CLIENT_NOT_FOUND',
    });
  }
  return serialize(found);
}

/**
 * Busca em lote por id — é o endpoint que mata o N+1 nas listagens de contrato do
 * sistema_gestao (1 chamada por página, nunca 1 por item). Ids inexistentes são
 * simplesmente omitidos do resultado (sem erro), igual ao GET /users/photos.
 */
export async function listByIds(ids: number[]) {
  const unique = [...new Set(ids)];
  const rows = await prisma.client.findMany({
    where: { id: { in: unique } },
    omit: LIST_OMIT,
    orderBy: { id: 'asc' },
  });
  return rows.map(serialize);
}

/** Clientes de um squad (via client.squad_id). Mesmo formato de GET /users/:id/led. */
export async function listBySquad(squadId: number, query: PaginationQuery) {
  await assertSquadExists(squadId);
  const where: Prisma.clientWhereInput = { squad_id: squadId };
  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      omit: LIST_OMIT,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.client.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}

/** Clientes atendidos por um especialista (via client.specialist_id → user). */
export async function listBySpecialist(specialistId: number, query: PaginationQuery) {
  await assertUserExists(specialistId, 'SPECIALIST_NOT_FOUND');
  const where: Prisma.clientWhereInput = { specialist_id: specialistId };
  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      omit: LIST_OMIT,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.client.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}

/** Busca textual dedicada (name/document, case-insensitive) — GET /clients/search?q=. */
export async function search(query: SearchClientsQuery) {
  const where: Prisma.clientWhereInput = {
    OR: [
      { name: { contains: query.q, mode: 'insensitive' } },
      { document: { contains: query.q, mode: 'insensitive' } },
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      omit: LIST_OMIT,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.client.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}

export async function create(input: CreateClientInput) {
  if (input.squad_id != null) await assertSquadExists(input.squad_id);
  if (input.specialist_id != null) {
    await assertUserExists(input.specialist_id, 'SPECIALIST_NOT_FOUND');
  }
  if (input.created_by !== undefined) {
    await assertUserExists(input.created_by, 'CREATED_BY_NOT_FOUND');
  }

  const data: Prisma.clientUncheckedCreateInput = { ...input };
  const created = await prisma.client.create({ data });
  return serialize(created);
}

export async function update(id: number, input: UpdateClientInput) {
  if (input.squad_id != null) await assertSquadExists(input.squad_id);
  if (input.specialist_id != null) {
    await assertUserExists(input.specialist_id, 'SPECIALIST_NOT_FOUND');
  }

  const data: Prisma.clientUncheckedUpdateInput = { ...input };
  const updated = await prisma.client.update({ where: { id }, data });
  return serialize(updated);
}
