import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const id = z.coerce.number().int().positive();

export const systemIdParamSchema = z.object({ systemId: id });
export const userIdParamSchema = z.object({ userId: id });

// Convenção (CLAUDE.md): query só carrega paginação (access-logs não tem `is_active`).
// Filtros antigos (success/from/to/user_id/system_id) viram ROTAS dedicadas, não params.
export const systemAccessLogsQuerySchema = paginationQuerySchema;
export type SystemAccessLogsQuery = z.infer<typeof systemAccessLogsQuerySchema>;

export const userAccessLogsQuerySchema = paginationQuerySchema;
export type UserAccessLogsQuery = z.infer<typeof userAccessLogsQuerySchema>;
