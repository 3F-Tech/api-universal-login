import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const systemIdParamSchema = z.object({ systemId: id });
export const buIdParamSchema = z.object({ buId: id });
export const systemBuParamsSchema = z.object({ systemId: id, buId: id });

export const linkBuBodySchema = z.object({
  bu_id: id,
});

export type LinkBuBody = z.infer<typeof linkBuBodySchema>;
