import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const id = z.coerce.number().int().positive();
const optionalId = id.optional();

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

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8).max(72),
  role: z.string().trim().min(1).max(50),
  personal_email: z.string().trim().toLowerCase().email().max(150).optional(),
  birth_date: z.coerce.date().optional(),
  cpf: z.string().trim().max(14).optional(),
  cnpj: z.string().trim().max(18).optional(),
  sex: z.string().trim().max(10).optional(),
  phone: z.string().trim().max(20).optional(),
  instagram: z.string().trim().max(100).optional(),
  linkedin: z.string().trim().max(200).optional(),
  department_id: optionalId,
  position_id: optionalId,
  bu_id: optionalId,
  band_id: optionalId,
  squad_id: optionalId,
  profile_picture: z.string().trim().optional(),
  cep: z.string().trim().max(9).optional(),
  street: z.string().trim().max(200).optional(),
  street_number: z.string().trim().max(20).optional(),
  neighborhood: z.string().trim().max(100).optional(),
  complement: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  country: z.string().trim().max(50).optional(),
  is_active: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
