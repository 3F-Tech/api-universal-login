import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { ALL_SCOPES } from '../../config/scopes.js';

const id = z.coerce.number().int().positive();

export const apiKeyParamsSchema = z.object({ id });

export const listApiKeysQuerySchema = paginationQuerySchema.extend({
  system_id: id.optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;

const scopesArray = z
  .array(z.string().trim())
  .refine((scopes) => scopes.every((s) => ALL_SCOPES.includes(s)), {
    message: 'A lista contém um scope inválido.',
  });

export const createApiKeySchema = z.object({
  system_id: id,
  name: z.string().trim().min(1).max(150),
  scopes: scopesArray.default([]),
  created_by: id,
  expires_at: z.coerce.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  scopes: scopesArray.optional(),
  is_active: z.boolean().optional(),
  expires_at: z.coerce.date().nullable().optional(),
});

export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
