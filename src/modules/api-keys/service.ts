import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { generateApiKey } from '../../utils/api-key-generator.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertSystemExists, assertUserExists } from '../../utils/references.js';
import type { CreateApiKeyInput, ListApiKeysQuery, UpdateApiKeyInput } from './schema.js';

// Nunca devolvemos o hash da key.
const SAFE_OMIT = { key_hash: true } as const;

function buildWhere(query: ListApiKeysQuery): Prisma.api_keyWhereInput {
  const where: Prisma.api_keyWhereInput = {};
  if (query.system_id !== undefined) where.system_id = query.system_id;
  if (query.is_active !== undefined) where.is_active = query.is_active;
  return where;
}

export async function list(query: ListApiKeysQuery) {
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    prisma.api_key.findMany({
      where,
      omit: SAFE_OMIT,
      orderBy: { id: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.api_key.count({ where }),
  ]);
  return { data, total };
}

export async function getById(id: number) {
  const apiKey = await prisma.api_key.findUnique({ where: { id }, omit: SAFE_OMIT });
  if (!apiKey) {
    throw new NotFoundError(`API key com id ${id} não encontrada.`, { code: 'API_KEY_NOT_FOUND' });
  }
  return apiKey;
}

/**
 * Gera uma nova API Key. A key crua é retornada UMA ÚNICA VEZ (só o hash é
 * persistido). Valida que system_id e created_by existem antes de criar.
 */
export async function create(input: CreateApiKeyInput) {
  await assertSystemExists(input.system_id);
  await assertUserExists(input.created_by, 'CREATED_BY_NOT_FOUND');

  const generated = generateApiKey();

  const apiKey = await prisma.api_key.create({
    data: {
      system_id: input.system_id,
      name: input.name,
      scopes: input.scopes,
      created_by: input.created_by,
      expires_at: input.expires_at ?? null,
      key_hash: generated.keyHash,
      key_prefix: generated.keyPrefix,
    },
    omit: SAFE_OMIT,
  });

  return { apiKey, plainKey: generated.key };
}

export async function update(id: number, input: UpdateApiKeyInput) {
  const data: Prisma.api_keyUncheckedUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    ...(input.expires_at !== undefined ? { expires_at: input.expires_at } : {}),
  };
  return prisma.api_key.update({ where: { id }, data, omit: SAFE_OMIT });
}

export async function remove(id: number): Promise<void> {
  await prisma.api_key.delete({ where: { id } });
}
