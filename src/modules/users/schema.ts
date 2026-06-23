import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const id = z.coerce.number().int().positive();
const optionalId = id.optional();
// FKs nullable no banco: aceitam null (limpar o vínculo) ou ausência.
const nullableId = id.nullish();

export const userParamsSchema = z.object({ id });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  is_active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  bu_id: optionalId,
  squad_id: optionalId,
  department_id: optionalId,
  // Busca textual por nome ou email.
  q: z.string().trim().min(1).max(150).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * Vínculo usuário↔BU (pivot users_bus). `from_squad` vem do FRONT: é o front que
 * identifica a BU do squad e marca true; as demais (atribuídas manualmente) ficam
 * false. A API apenas persiste — não há sincronização automática com squad.bu_id.
 */
const busLinkSchema = z.object({
  bu_id: id,
  from_squad: z.boolean().optional().default(false),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8).max(72),
  role: z.string().trim().min(1).max(50),
  personal_email: z.string().trim().toLowerCase().email().max(150).nullish(),
  birth_date: z.coerce.date().nullish(),
  cpf: z.string().trim().max(14).nullish(),
  cnpj: z.string().trim().max(18).nullish(),
  sex: z.string().trim().max(10).nullish(),
  phone: z.string().trim().max(20).nullish(),
  instagram: z.string().trim().max(100).nullish(),
  linkedin: z.string().trim().max(200).nullish(),
  department_id: nullableId,
  position_id: nullableId,
  band_id: nullableId,
  squad_id: nullableId,
  // Vínculos N:N com BUs. Presente no create grava os vínculos; no update (vide
  // updateUserSchema) presente = substitui todos, ausente = não mexe.
  bus: z.array(busLinkSchema).optional(),
  profile_picture: z.string().trim().nullish(),
  cep: z.string().trim().max(9).nullish(),
  street: z.string().trim().max(200).nullish(),
  street_number: z.string().trim().max(20).nullish(),
  neighborhood: z.string().trim().max(100).nullish(),
  complement: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(50).nullish(),
  country: z.string().trim().max(50).nullish(),
  is_active: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
