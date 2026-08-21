import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB');

export const buParamsSchema = z.object({ id });

// Convenção (CLAUDE.md): query só carrega `is_active` + paginação. Filtro por
// `parent_id` e busca textual viram ROTAS dedicadas, não params.
export const listBusQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
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
  // Identidade jurídica + endereço da BU: usados como parte CONTRATANTE no
  // preâmbulo dos contratos gerados por sistemas consumidores. Todos opcionais e
  // `.nullish()` (colunas nullable) — `null` limpa o valor, omitido não mexe.
  // `legal_name`/`legal_nature` são `text` no banco: sem `.max()`, igual a `description`.
  legal_name: z.string().trim().nullish(),
  legal_nature: z.string().trim().nullish(),
  // Sem validação de máscara: guarda como o cliente enviar (com ou sem pontuação).
  // Sem unique no banco — duas BUs podem operar sob o mesmo CNPJ (holding).
  cnpj: z.string().trim().max(18).nullish(),
  email: z.string().trim().toLowerCase().email().max(150).nullish(),
  phone: z.string().trim().max(20).nullish(),
  // Endereço: mesmos nomes/limites de `users` (convenção única na API, não um
  // dialeto por entidade). `state` é string livre como em `user.state` — sem
  // regex de UF, para não inventar validação que `users` não tem.
  cep: z.string().trim().max(9).nullish(),
  street: z.string().trim().max(200).nullish(),
  street_number: z.string().trim().max(20).nullish(),
  complement: z.string().trim().max(200).nullish(),
  neighborhood: z.string().trim().max(100).nullish(),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(50).nullish(),
  country: z.string().trim().max(50).nullish(),
  is_active: z.boolean().optional(),
});

export type CreateBuInput = z.infer<typeof createBuSchema>;

export const updateBuSchema = createBuSchema.partial();
export type UpdateBuInput = z.infer<typeof updateBuSchema>;
