import type { Request, Response } from 'express';
import * as departmentsService from './service.js';
import {
  createDepartmentSchema,
  departmentParamsSchema,
  listDepartmentsQuerySchema,
  updateDepartmentSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listDepartmentsQuerySchema.parse(req.query);
  const { data, total } = await departmentsService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = departmentParamsSchema.parse(req.params);
  sendItem(res, await departmentsService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createDepartmentSchema.parse(req.body);
  sendItem(res, await departmentsService.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = departmentParamsSchema.parse(req.params);
  const input = updateDepartmentSchema.parse(req.body);
  sendItem(res, await departmentsService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = departmentParamsSchema.parse(req.params);
  await departmentsService.remove(id);
  sendItem(res, { id, deleted: true });
}
