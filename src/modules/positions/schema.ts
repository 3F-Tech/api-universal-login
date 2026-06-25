import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();

export const positionParamsSchema = z.object({ id });

// Convenção (CLAUDE.md): query só carrega `is_active` + paginação. Busca textual vira rota dedicada.
export const listPositionsQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
});

export type ListPositionsQuery = z.infer<typeof listPositionsQuerySchema>;

export const createPositionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  is_active: z.boolean().optional(),
  created_by: id.optional(),
});

export type CreatePositionInput = z.infer<typeof createPositionSchema>;

export const updatePositionSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
});

export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
