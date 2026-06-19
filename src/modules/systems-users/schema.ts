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

export const replaceSystemsBodySchema = z.object({
  systems: z.array(
    z.object({
      system_id: id,
      role: z.string().min(1),
    }),
  ),
});

export type LinkUserBody = z.infer<typeof linkUserBodySchema>;
export type ReplaceSystemsBody = z.infer<typeof replaceSystemsBodySchema>;
