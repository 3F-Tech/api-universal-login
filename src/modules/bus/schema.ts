import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB');

export const buParamsSchema = z.object({ id });

export const listBusQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
  parent_id: id.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export type ListBusQuery = z.infer<typeof listBusQuerySchema>;

export const createBuSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  description: z.string().trim().nullish(),
  primary_color_hex: hexColor.nullish(),
  secondary_color_hex: hexColor.nullish(),
  parent_id: id.nullish(),
  logo_picture: z.string().trim().nullish(),
  is_active: z.boolean().optional(),
});

export type CreateBuInput = z.infer<typeof createBuSchema>;

export const updateBuSchema = createBuSchema.partial();
export type UpdateBuInput = z.infer<typeof updateBuSchema>;
