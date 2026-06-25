import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();

export const departmentParamsSchema = z.object({ id });

// Convenção (CLAUDE.md): query só carrega `is_active` + paginação. Busca textual vira rota dedicada.
export const listDepartmentsQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
});

export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().max(100).nullish(),
  is_active: z.boolean().optional(),
  created_by: id.optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

// created_by é definido na criação e não é alterável via update.
export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  icon: z.string().trim().max(100).nullish(),
  is_active: z.boolean().optional(),
});

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
