import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const systemIdParamSchema = z.object({ systemId: id });
export const userIdParamSchema = z.object({ userId: id });
export const systemUserParamsSchema = z.object({ systemId: id, userId: id });

export const linkUserBodySchema = z.object({
  user_id: id,
  // Aceito por compatibilidade com o contrato, mas NÃO persistido:
  // a tabela systems_users não tem coluna created_by.
  created_by: id.optional(),
});

// Operações em LOTE sobre o vínculo user↔system (link e unlink): recebem `user_ids`.
// Mesmo shape pros dois; deduplicado no service. Link cria com role nulo (como o link único).
export const MAX_BATCH_USERS = 100;

export const batchUserIdsBodySchema = z.object({
  user_ids: z
    .array(id)
    .min(1, 'Informe ao menos um user_id em "user_ids".')
    .max(MAX_BATCH_USERS, `Máximo de ${MAX_BATCH_USERS} usuários por requisição.`),
});

export const replaceSystemsBodySchema = z.object({
  systems: z.array(
    z.object({
      system_id: id,
      // Coluna é nullable — o front manda null quando não há papel específico
      // para aquele sistema (mesmo default do link único via POST).
      role: z.string().min(1).nullable(),
    }),
  ),
});

export type LinkUserBody = z.infer<typeof linkUserBodySchema>;
export type BatchUserIdsBody = z.infer<typeof batchUserIdsBodySchema>;
export type ReplaceSystemsBody = z.infer<typeof replaceSystemsBodySchema>;
