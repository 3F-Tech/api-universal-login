import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { generateApiKey } from '../../utils/api-key-generator.js';
import { NotFoundError } from '../../utils/errors.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertSystemExists, assertUserExists } from '../../utils/references.js';
import {
  API_KEY_TYPES,
  API_KEY_TYPE_NAMES,
  scopesForType,
  typeForScopes,
} from '../../config/scopes.js';
import type { ApiKeyType } from '../../config/scopes.js';
import type { CreateApiKeyInput, ListApiKeysQuery, UpdateApiKeyInput } from './schema.js';

// Nunca devolvemos o hash da key.
const SAFE_OMIT = { key_hash: true } as const;

/** Anexa o `type` derivado dos scopes, pro front exibir sem reprocessar. */
function withType<T extends { scopes: string[] }>(apiKey: T): T & { type: ApiKeyType | null } {
  return { ...apiKey, type: typeForScopes(apiKey.scopes) };
}

function buildWhere(query: ListApiKeysQuery): Prisma.api_keyWhereInput {
  const where: Prisma.api_keyWhereInput = {};
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
  return { data: data.map(withType), total };
}

export async function getById(id: number) {
  const apiKey = await prisma.api_key.findUnique({ where: { id }, omit: SAFE_OMIT });
  if (!apiKey) {
    throw new NotFoundError(`API key com id ${id} não encontrada.`, { code: 'API_KEY_NOT_FOUND' });
  }
  return withType(apiKey);
}

/**
 * Gera uma nova API Key. A key crua é retornada UMA ÚNICA VEZ (só o hash é
 * persistido). Valida que system_id e created_by existem antes de criar.
 */
export async function create(input: CreateApiKeyInput) {
  await assertSystemExists(input.system_id);
  if (input.created_by !== undefined)
    await assertUserExists(input.created_by, 'CREATED_BY_NOT_FOUND');

  const generated = generateApiKey();

  const apiKey = await prisma.api_key.create({
    data: {
      system_id: input.system_id,
      name: input.name,
      scopes: scopesForType(input.type as ApiKeyType),
      created_by: input.created_by,
      expires_at: input.expires_at ?? null,
      key_hash: generated.keyHash,
      key_prefix: generated.keyPrefix,
    },
    omit: SAFE_OMIT,
  });

  return { apiKey: withType(apiKey), plainKey: generated.key };
}

export async function update(id: number, input: UpdateApiKeyInput) {
  const data: Prisma.api_keyUncheckedUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    // Mudar o tipo regenera os scopes a partir do catálogo.
    ...(input.type !== undefined ? { scopes: scopesForType(input.type as ApiKeyType) } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    ...(input.expires_at !== undefined ? { expires_at: input.expires_at } : {}),
  };
  const updated = await prisma.api_key.update({ where: { id }, data, omit: SAFE_OMIT });
  return withType(updated);
}

export async function remove(id: number): Promise<void> {
  await prisma.api_key.delete({ where: { id } });
}

/** Catálogo de tipos de key disponíveis, para o front montar o seletor. */
export function listTypes() {
  return API_KEY_TYPE_NAMES.map((name) => ({
    type: name,
    label: API_KEY_TYPES[name].label,
    description: API_KEY_TYPES[name].description,
    scopes: [...API_KEY_TYPES[name].scopes],
  }));
}
