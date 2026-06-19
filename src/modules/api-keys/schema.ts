import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { API_KEY_TYPE_NAMES } from '../../config/scopes.js';

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

// O cliente escolhe um TIPO de key (ex: 'login'); a API expande nos scopes
// certos (ver `config/scopes.ts`). Scopes crus não são aceitos da borda.
const apiKeyType = z.enum(API_KEY_TYPE_NAMES as [string, ...string[]]);

export const createApiKeySchema = z.object({
  system_id: id,
  name: z.string().trim().min(1).max(150),
  type: apiKeyType,
  created_by: id.optional(),
  expires_at: z.coerce.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  type: apiKeyType.optional(),
  is_active: z.boolean().optional(),
  expires_at: z.coerce.date().nullable().optional(),
});

export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
