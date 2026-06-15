import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();

export const systemParamsSchema = z.object({ id });

export const listSystemsQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
  q: z.string().trim().min(1).max(150).optional(),
});

export type ListSystemsQuery = z.infer<typeof listSystemsQuerySchema>;

export const createSystemSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().optional(),
  link: z.string().trim().url().max(500).optional(),
  logo_picture: z.string().trim().optional(),
  is_active: z.boolean().optional(),
});

export type CreateSystemInput = z.infer<typeof createSystemSchema>;

export const updateSystemSchema = createSystemSchema.partial();
export type UpdateSystemInput = z.infer<typeof updateSystemSchema>;
