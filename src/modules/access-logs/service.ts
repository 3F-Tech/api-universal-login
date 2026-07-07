import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { toSkipTake } from '../../utils/pagination.js';
import { assertBuExists, assertSystemExists, assertUserExists } from '../../utils/references.js';
import { ValidationError } from '../../utils/errors.js';
import { DEFAULT_STATS_DAYS } from './schema.js';
import type {
  AccessLogStatsQuery,
  AccessLogTodayQuery,
  SystemAccessLogsQuery,
  UserAccessLogsQuery,
} from './schema.js';

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
    // true = tentativa com senha errada (de usuário válido com acesso). Pode ser null em
    // registros antigos, anteriores à criação da coluna.
    wrong_password: row.wrong_password,
    accessed_at: row.accessed_at,
  };
}

export async function listSystemAccessLogs(systemId: number, query: SystemAccessLogsQuery) {
  await assertSystemExists(systemId);

  const where: Prisma.systems_users_accessWhereInput = {
    systems_users: { system_id: systemId },
  };

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

/** Acessos de UM usuário em UM sistema (recorte do `listUserAccessLogs`/`listSystemAccessLogs`). */
export async function listUserSystemAccessLogs(
  systemId: number,
  userId: number,
  query: SystemAccessLogsQuery,
) {
  await assertSystemExists(systemId);
  await assertUserExists(userId);

  // O UNIQUE (system_id, user_id) em systems_users garante que isto aponta pra 1 vínculo só.
  const where: Prisma.systems_users_accessWhereInput = {
    systems_users: { system_id: systemId, user_id: userId },
  };

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

// --- GET /access-logs/stats ---------------------------------------------------

const SAO_PAULO_TZ = 'America/Sao_Paulo';
const DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO_TZ });
const MS_PER_DAY = 86_400_000;

/** Dia de hoje (YYYY-MM-DD) já no fuso America/Sao_Paulo. */
function todaySaoPaulo(): string {
  return DAY_FORMATTER.format(new Date());
}

/** Soma/subtrai dias de uma data YYYY-MM-DD (aritmética de calendário, sem fuso). */
function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const diff = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.round(diff / MS_PER_DAY) + 1;
}

/**
 * Combinações conflitantes de filtros ganham código próprio (não o VALIDATION_ERROR
 * genérico do Zod) para o front distinguir e orientar o usuário no formulário.
 */
function validateStatsFilters(query: AccessLogStatsQuery): void {
  if (query.system_id !== undefined && query.bu_id !== undefined) {
    throw new ValidationError(
      'Filtre por "system_id" ou "bu_id", não os dois — um sistema já pertence a uma BU.',
      { code: 'CONFLICTING_FILTERS' },
    );
  }
  if (query.days !== undefined && (query.from !== undefined || query.to !== undefined)) {
    throw new ValidationError('Envie "days" ou "from"/"to", não os dois.', {
      code: 'CONFLICTING_RANGE',
    });
  }
  if ((query.from === undefined) !== (query.to === undefined)) {
    throw new ValidationError('"from" e "to" devem ser enviados juntos.', {
      code: 'INCOMPLETE_RANGE',
    });
  }
  if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
    throw new ValidationError('"from" deve ser menor ou igual a "to".', {
      code: 'INVALID_RANGE',
    });
  }
}

function resolveStatsRange(
  query: AccessLogStatsQuery,
  defaultDays = DEFAULT_STATS_DAYS,
): { from: string; to: string; days: number } {
  if (query.from !== undefined && query.to !== undefined) {
    return { from: query.from, to: query.to, days: daysBetween(query.from, query.to) };
  }
  const to = todaySaoPaulo();
  const days = query.days ?? defaultDays;
  return { from: addDays(to, -(days - 1)), to, days };
}

/**
 * Resolve os `system_id` do filtro: `bu_id` → sistemas vinculados à BU (via `systems_bus`);
 * `system_id` → `[id]`; nenhum dos dois → `undefined` (= todos os sistemas). Compartilhado
 * pelo `/stats` e pelo `/wrong-password`. `[]` significa "BU sem sistema" → resultado vazio.
 */
async function resolveSystemIds(query: AccessLogStatsQuery): Promise<number[] | undefined> {
  if (query.bu_id !== undefined) {
    const links = await prisma.systems_bus.findMany({
      where: { bu_id: query.bu_id },
      select: { system_id: true },
    });
    return links.map((l) => l.system_id);
  }
  if (query.system_id !== undefined) return [query.system_id];
  return undefined;
}

interface DailyCountRow {
  day: Date;
  success: number;
  fail: number;
  wrong_password: number;
}

interface SystemCountRow {
  system_id: number;
  success: boolean;
  count: number;
}

/**
 * Colapsa as linhas (system_id, success) do GROUP BY num array por sistema com
 * `success`/`fail` somados, ordenado por `success` desc — o primeiro item é o
 * sistema mais acessado do range (alimenta o KPI "Sistema Mais Acessado"). Só é
 * montado quando a consulta NÃO fixa um system_id (senão o breakdown seria de 1 só).
 */
function buildBySystem(
  rows: SystemCountRow[],
): { system_id: number; success: number; fail: number }[] {
  const map = new Map<number, { success: number; fail: number }>();
  for (const row of rows) {
    const entry = map.get(row.system_id) ?? { success: 0, fail: 0 };
    if (row.success) entry.success = row.count;
    else entry.fail = row.count;
    map.set(row.system_id, entry);
  }
  return [...map.entries()]
    .map(([system_id, counts]) => ({ system_id, ...counts }))
    .sort((a, b) => b.success - a.success);
}

/**
 * Agrega systems_users_access por dia de calendário em America/Sao_Paulo (a coluna
 * é timestamptz — bucketizar certo exige converter o fuso no próprio SQL, não em JS).
 * Alimenta o gráfico de barras empilhadas (sucesso x falha) por dia, com dias sem
 * acesso zerados no meio do range (barra contínua).
 */
export async function getAccessLogStats(query: AccessLogStatsQuery) {
  validateStatsFilters(query);
  if (query.system_id !== undefined) await assertSystemExists(query.system_id);
  if (query.bu_id !== undefined) await assertBuExists(query.bu_id);
  if (query.user_id !== undefined) await assertUserExists(query.user_id);

  const { from, to, days } = resolveStatsRange(query);
  const systemIds = await resolveSystemIds(query);

  const buckets = new Map<string, { success: number; fail: number; wrong_password: number }>();
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    buckets.set(cursor, { success: 0, fail: 0, wrong_password: 0 });
  }

  // Breakdown por sistema só quando a consulta agrega vários sistemas (sem system_id fixo);
  // com system_id o array seria de 1 item só, então o campo é omitido (ver contrato da rota).
  const includeBySystem = query.system_id === undefined;

  let uniqueUsers = 0;
  let bySystem: { system_id: number; success: number; fail: number }[] = [];

  // BU sem nenhum sistema vinculado: nada a consultar, buckets/by_system ficam zerados/vazios.
  if (systemIds === undefined || systemIds.length > 0) {
    const systemFilter =
      systemIds !== undefined
        ? Prisma.sql`AND su.system_id IN (${Prisma.join(systemIds)})`
        : Prisma.empty;

    // Escopo por usuário (ortogonal ao systemFilter): aplicado a TODAS as queries do agregado.
    const userFilter =
      query.user_id !== undefined ? Prisma.sql`AND su.user_id = ${query.user_id}` : Prisma.empty;

    // "Sucesso" no gráfico/KPI = login REAL: senha errada (success=true, wrong_password=true)
    // NÃO conta como sucesso aqui. Preserva o comportamento do dashboard de antes da coluna
    // wrong_password existir (quando senha errada era success=false).
    const isRealSuccess = Prisma.sql`(sua.success AND NOT COALESCE(sua.wrong_password, false))`;

    const [rows, uniqueRows, systemRows] = await Promise.all([
      prisma.$queryRaw<DailyCountRow[]>`
        SELECT
          (sua.accessed_at AT TIME ZONE ${SAO_PAULO_TZ})::date AS day,
          COUNT(*) FILTER (WHERE ${isRealSuccess})::int AS success,
          COUNT(*) FILTER (WHERE NOT ${isRealSuccess})::int AS fail,
          COUNT(*) FILTER (WHERE sua.wrong_password = true)::int AS wrong_password
        FROM systems_users_access sua
        JOIN systems_users su ON su.id = sua.systems_users_id
        WHERE (sua.accessed_at AT TIME ZONE ${SAO_PAULO_TZ})::date BETWEEN ${from}::date AND ${to}::date
        ${systemFilter}
        ${userFilter}
        GROUP BY day
      `,
      prisma.$queryRaw<{ unique_users: number }[]>`
        SELECT COUNT(DISTINCT su.user_id)::int AS unique_users
        FROM systems_users_access sua
        JOIN systems_users su ON su.id = sua.systems_users_id
        WHERE (sua.accessed_at AT TIME ZONE ${SAO_PAULO_TZ})::date BETWEEN ${from}::date AND ${to}::date
        ${systemFilter}
        ${userFilter}
      `,
      // Só dispara a query extra quando o campo vai existir na resposta.
      includeBySystem
        ? prisma.$queryRaw<SystemCountRow[]>`
            SELECT
              su.system_id AS system_id,
              ${isRealSuccess} AS success,
              COUNT(*)::int AS count
            FROM systems_users_access sua
            JOIN systems_users su ON su.id = sua.systems_users_id
            WHERE (sua.accessed_at AT TIME ZONE ${SAO_PAULO_TZ})::date BETWEEN ${from}::date AND ${to}::date
            ${systemFilter}
            ${userFilter}
            GROUP BY su.system_id, ${isRealSuccess}
          `
        : Promise.resolve<SystemCountRow[]>([]),
    ]);

    for (const row of rows) {
      const dateKey = row.day.toISOString().slice(0, 10);
      const bucket = buckets.get(dateKey);
      if (!bucket) continue;
      bucket.success = row.success;
      bucket.fail = row.fail;
      // wrong_password é subconjunto de fail (senha errada cai em fail via isRealSuccess).
      bucket.wrong_password = row.wrong_password;
    }

    uniqueUsers = uniqueRows[0]?.unique_users ?? 0;
    bySystem = buildBySystem(systemRows);
  }

  const result: {
    range: { from: string; to: string; days: number };
    unique_users: number;
    buckets: { date: string; success: number; fail: number; wrong_password: number }[];
    by_system?: { system_id: number; success: number; fail: number }[];
  } = {
    range: { from, to, days },
    unique_users: uniqueUsers,
    buckets: [...buckets.entries()].map(([date, counts]) => ({ date, ...counts })),
  };
  // Presença do campo depende SÓ de system_id ter sido informado (não de haver dados):
  // sem system_id → by_system presente (array, possivelmente vazio); com system_id → ausente.
  if (includeBySystem) result.by_system = bySystem;
  return result;
}

// --- GET /access-logs/wrong-password ------------------------------------------

export interface WrongPasswordUser {
  user_id: number;
  name: string;
  email: string;
  attempts: number;
  last_attempt_at: Date;
}

interface WrongPasswordRow {
  user_id: number;
  attempts: number;
  last_attempt_at: Date;
}

/**
 * Usuários que erraram a senha (`wrong_password = true`) no range, **agregados por usuário**:
 * nº de tentativas + tentativa mais recente, ordenado por `attempts` desc (mais recente
 * desempata). Alimenta o card "quem errou a senha hoje". Mesmo contrato de filtro do `/stats`
 * (`days`/`from`/`to`/`system_id`/`bu_id`), mas o **default é HOJE** (1 dia), não 7.
 *
 * Custo fixo: 1 query raw agregada + 1 `findMany` para resolver nome/email (sem N+1). O front
 * recebe a lista pronta, sem cruzar `/users`.
 */
export async function getWrongPasswordUsers(
  query: AccessLogStatsQuery,
): Promise<WrongPasswordUser[]> {
  validateStatsFilters(query);
  if (query.system_id !== undefined) await assertSystemExists(query.system_id);
  if (query.bu_id !== undefined) await assertBuExists(query.bu_id);

  const { from, to } = resolveStatsRange(query, 1); // default = hoje
  const systemIds = await resolveSystemIds(query);

  // BU sem nenhum sistema vinculado → ninguém a listar.
  if (systemIds !== undefined && systemIds.length === 0) return [];

  const systemFilter =
    systemIds !== undefined
      ? Prisma.sql`AND su.system_id IN (${Prisma.join(systemIds)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<WrongPasswordRow[]>`
    SELECT
      su.user_id AS user_id,
      COUNT(*)::int AS attempts,
      MAX(sua.accessed_at) AS last_attempt_at
    FROM systems_users_access sua
    JOIN systems_users su ON su.id = sua.systems_users_id
    WHERE sua.wrong_password = true
      AND (sua.accessed_at AT TIME ZONE ${SAO_PAULO_TZ})::date BETWEEN ${from}::date AND ${to}::date
      ${systemFilter}
    GROUP BY su.user_id
    ORDER BY attempts DESC, last_attempt_at DESC
  `;
  if (rows.length === 0) return [];

  // Resolve nome/email em lote (o cascade garante que o user existe enquanto houver log dele).
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.user_id) } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return rows.map((r) => ({
    user_id: r.user_id,
    name: byId.get(r.user_id)?.name ?? '',
    email: byId.get(r.user_id)?.email ?? '',
    attempts: r.attempts,
    last_attempt_at: r.last_attempt_at,
  }));
}

// --- GET /access-logs/today ---------------------------------------------------

interface TodayAccessRow {
  user_id: number;
  system_id: number;
  accessed_at: Date;
  success: boolean;
  wrong_password: boolean | null;
}

/**
 * Lista individual (não agregada) de TODOS os acessos de HOJE (fuso America/Sao_Paulo, decidido no
 * SQL), todos os sistemas, ordenada por `accessed_at` desc. Sem paginação e sem resolver nome/email
 * (o front cruza com os stores). Único filtro: `bu_id` opcional (restringe aos sistemas da BU).
 *
 * Não seleciona `sua.id` (BigInt) — logo não precisa de `.toString()`; o shape é enxuto de propósito.
 */
export async function getTodayAccessLogs(query: AccessLogTodayQuery): Promise<TodayAccessRow[]> {
  if (query.bu_id !== undefined) await assertBuExists(query.bu_id);

  const systemIds = await resolveSystemIds({ bu_id: query.bu_id });
  // BU sem nenhum sistema vinculado → nada a listar.
  if (systemIds !== undefined && systemIds.length === 0) return [];

  const systemFilter =
    systemIds !== undefined
      ? Prisma.sql`AND su.system_id IN (${Prisma.join(systemIds)})`
      : Prisma.empty;

  const today = todaySaoPaulo();

  return prisma.$queryRaw<TodayAccessRow[]>`
    SELECT
      su.user_id AS user_id,
      su.system_id AS system_id,
      sua.accessed_at AS accessed_at,
      sua.success AS success,
      sua.wrong_password AS wrong_password
    FROM systems_users_access sua
    JOIN systems_users su ON su.id = sua.systems_users_id
    WHERE (sua.accessed_at AT TIME ZONE ${SAO_PAULO_TZ})::date = ${today}::date
    ${systemFilter}
    ORDER BY sua.accessed_at DESC
  `;
}

export async function listUserAccessLogs(userId: number, query: UserAccessLogsQuery) {
  await assertUserExists(userId);

  const where: Prisma.systems_users_accessWhereInput = {
    systems_users: { user_id: userId },
  };

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
