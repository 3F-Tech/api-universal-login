import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const id = z.coerce.number().int().positive();

export const systemIdParamSchema = z.object({ systemId: id });
export const userIdParamSchema = z.object({ userId: id });
// Recorte "acessos de UM usuário em UM sistema" (rota dedicada, não param — convenção CLAUDE.md).
export const systemUserParamsSchema = z.object({ systemId: id, userId: id });

// Convenção (CLAUDE.md): query só carrega paginação (access-logs não tem `is_active`).
// Filtros antigos (success/from/to/user_id/system_id) viram ROTAS dedicadas, não params.
export const systemAccessLogsQuerySchema = paginationQuerySchema;
export type SystemAccessLogsQuery = z.infer<typeof systemAccessLogsQuerySchema>;

export const userAccessLogsQuerySchema = paginationQuerySchema;
export type UserAccessLogsQuery = z.infer<typeof userAccessLogsQuerySchema>;

export const MAX_STATS_DAYS = 90;
export const DEFAULT_STATS_DAYS = 7;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

// Rota agregada pro gráfico de barras empilhadas (sucesso/falha por dia). Combinações
// conflitantes (days + from/to, system_id + bu_id, from sem to) são validadas no
// service (validateStatsFilters), não aqui — precisam de códigos de erro distintos
// pro front, e não só o VALIDATION_ERROR genérico do ZodError.
export const accessLogStatsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(MAX_STATS_DAYS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  system_id: id.optional(),
  bu_id: id.optional(),
  // Escopa o agregado a UM usuário (gráficos de investigação de acesso do usuário).
  // Ortogonal a system_id/bu_id: combina com qualquer um (system_id/bu_id seguem exclusivos entre si).
  user_id: id.optional(),
});
export type AccessLogStatsQuery = z.infer<typeof accessLogStatsQuerySchema>;

// Lista individual (não agregada) dos acessos de HOJE, todos os sistemas. Só filtro opcional bu_id
// (sempre hoje, sempre todos os sistemas — sem days/from/to/system_id, sem paginação).
export const accessLogTodayQuerySchema = z.object({ bu_id: id.optional() });
export type AccessLogTodayQuery = z.infer<typeof accessLogTodayQuerySchema>;
