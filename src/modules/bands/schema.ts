import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();

export const bandParamsSchema = z.object({ id });

export const listBandsQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export type ListBandsQuery = z.infer<typeof listBandsQuerySchema>;

export const createBandSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color_hex: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
    .optional(),
  icon: z.string().trim().min(1).max(100).optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  created_by: id.optional(),
});

export type CreateBandInput = z.infer<typeof createBandSchema>;

export const updateBandSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color_hex: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
    .optional(),
  icon: z.string().trim().min(1).max(100).optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateBandInput = z.infer<typeof updateBandSchema>;
