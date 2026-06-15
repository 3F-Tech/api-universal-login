import { describe, expect, it } from 'vitest';
import { buildMeta, paginationQuerySchema, toSkipTake } from '../../src/utils/pagination.js';

describe('pagination', () => {
  it('aplica defaults (page=1, perPage=20)', () => {
    const q = paginationQuerySchema.parse({});
    expect(q.page).toBe(1);
    expect(q.perPage).toBe(20);
  });

  it('faz coerce de strings e calcula skip/take', () => {
    const q = paginationQuerySchema.parse({ page: '3', perPage: '25' });
    expect(toSkipTake(q)).toEqual({ skip: 50, take: 25 });
  });

  it('rejeita perPage acima do máximo (100)', () => {
    expect(() => paginationQuerySchema.parse({ perPage: '500' })).toThrow();
  });

  it('buildMeta monta o objeto meta', () => {
    expect(buildMeta(150, { page: 2, perPage: 20 })).toEqual({ total: 150, page: 2, perPage: 20 });
  });
});
