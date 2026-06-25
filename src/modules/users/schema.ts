import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const id = z.coerce.number().int().positive();
// FKs nullable no banco: aceitam null (limpar o vínculo) ou ausência.
const nullableId = id.nullish();

export const userParamsSchema = z.object({ id });

// Convenção (CLAUDE.md): query só carrega `is_active` + paginação. Filtros como
// bu_id/squad_id/department_id/busca textual viram ROTAS dedicadas, não params.
export const listUsersQuerySchema = paginationQuerySchema.extend({
  is_active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * Rota de fotos em lote: `GET /users/photos?ids=1,2,3`.
 *
 * A listagem `/users` deixou de mandar `profile_picture` (base64 de ~1,6 MB
 * médio travava a lista em ~5,5 s). O front renderiza os cards leves e, depois,
 * busca as fotos só da página visível (ou dos resultados de uma busca) numa
 * ÚNICA requisição cacheável — em vez de 1 request por usuário (que estouraria
 * o rate limit de 100/min por API Key).
 *
 * `ids` vem como CSV na query (`?ids=1,2,3`), é deduplicado e limitado a
 * MAX_PHOTO_IDS por requisição (bound no payload).
 */
export const MAX_PHOTO_IDS = 50;

export const userPhotosQuerySchema = z.object({
  ids: z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    )
    // Valida como string (input/output do pipe = string[]; evita o input `unknown`
    // de z.coerce que quebra a inferência do .pipe no Zod v4). Converte pra número
    // e deduplica no transform final.
    .pipe(
      z
        .array(z.string().regex(/^[1-9]\d*$/, 'ids devem ser inteiros positivos.'))
        .min(1, 'Informe ao menos um id em ?ids=.')
        .max(MAX_PHOTO_IDS, `Máximo de ${MAX_PHOTO_IDS} ids por requisição.`),
    )
    .transform((arr) => [...new Set(arr.map(Number))]),
});

export type UserPhotosQuery = z.infer<typeof userPhotosQuerySchema>;

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
