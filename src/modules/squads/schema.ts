import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();

export const squadParamsSchema = z.object({ id });

// Convenção (CLAUDE.md): query só carrega `is_active` + paginação. Filtros
// (bu_id/leader_id/busca) e a contagem de membros viram ROTAS dedicadas, não params.
export const listSquadsQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
});

export type ListSquadsQuery = z.infer<typeof listSquadsQuerySchema>;

export const createSquadSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().nullish(),
  picture: z.string().trim().nullish(),
  // leader_id é obrigatório no create (mesma lógica do created_by).
  leader_id: id,
  bu_id: id.nullish(),
  is_active: z.boolean().optional(),
});

export type CreateSquadInput = z.infer<typeof createSquadSchema>;

export const updateSquadSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().nullish(),
  picture: z.string().trim().nullish(),
  leader_id: id.optional(),
  bu_id: id.nullish(),
  is_active: z.boolean().optional(),
});

export type UpdateSquadInput = z.infer<typeof updateSquadSchema>;
