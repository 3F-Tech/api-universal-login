import { z } from 'zod';
import type { ListMeta } from './http.js';

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

/** Query string `?page=&perPage=` validada e com defaults. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Converte page/perPage no `skip`/`take` do Prisma. */
export function toSkipTake({ page, perPage }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * perPage, take: perPage };
}

/** Monta o objeto `meta` da resposta de lista. */
export function buildMeta(total: number, { page, perPage }: PaginationQuery): ListMeta {
  return { total, page, perPage };
}
