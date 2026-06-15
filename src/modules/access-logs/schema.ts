import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();

export const systemIdParamSchema = z.object({ systemId: id });
export const userIdParamSchema = z.object({ userId: id });

const commonFilters = {
  success: booleanQueryParam.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const systemAccessLogsQuerySchema = paginationQuerySchema.extend({
  ...commonFilters,
  user_id: id.optional(),
});
export type SystemAccessLogsQuery = z.infer<typeof systemAccessLogsQuerySchema>;

export const userAccessLogsQuerySchema = paginationQuerySchema.extend({
  ...commonFilters,
  system_id: id.optional(),
});
export type UserAccessLogsQuery = z.infer<typeof userAccessLogsQuerySchema>;
