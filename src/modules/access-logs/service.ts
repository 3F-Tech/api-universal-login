import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertSystemExists, assertUserExists } from '../../utils/references.js';
import type { SystemAccessLogsQuery, UserAccessLogsQuery } from './schema.js';

// O include traz só os ids do vínculo; tipamos o row com esse shape.
type AccessLogRow = Prisma.systems_users_accessGetPayload<{
  include: { systems_users: { select: { user_id: true; system_id: true } } };
}>;

const INCLUDE = { systems_users: { select: { user_id: true, system_id: true } } } as const;

/** systems_users_access.id é BigInt — convertido para string no JSON. */
function serialize(row: AccessLogRow) {
  return {
    id: row.id.toString(),
    systems_users_id: row.systems_users_id,
    user_id: row.systems_users.user_id,
    system_id: row.systems_users.system_id,
    success: row.success,
    accessed_at: row.accessed_at,
  };
}

function applyDateRange(
  where: Prisma.systems_users_accessWhereInput,
  from?: Date,
  to?: Date,
): void {
  if (from || to) {
    where.accessed_at = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }
}

export async function listSystemAccessLogs(systemId: number, query: SystemAccessLogsQuery) {
  await assertSystemExists(systemId);

  const where: Prisma.systems_users_accessWhereInput = {
    systems_users: {
      system_id: systemId,
      ...(query.user_id !== undefined ? { user_id: query.user_id } : {}),
    },
  };
  if (query.success !== undefined) where.success = query.success;
  applyDateRange(where, query.from, query.to);

  const [rows, total] = await Promise.all([
    prisma.systems_users_access.findMany({
      where,
      include: INCLUDE,
      orderBy: { accessed_at: 'desc' },
      ...toSkipTake(query),
    }),
    prisma.systems_users_access.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}

export async function listUserAccessLogs(userId: number, query: UserAccessLogsQuery) {
  await assertUserExists(userId);

  const where: Prisma.systems_users_accessWhereInput = {
    systems_users: {
      user_id: userId,
      ...(query.system_id !== undefined ? { system_id: query.system_id } : {}),
    },
  };
  if (query.success !== undefined) where.success = query.success;
  applyDateRange(where, query.from, query.to);

  const [rows, total] = await Promise.all([
    prisma.systems_users_access.findMany({
      where,
      include: INCLUDE,
      orderBy: { accessed_at: 'desc' },
      ...toSkipTake(query),
    }),
    prisma.systems_users_access.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}
