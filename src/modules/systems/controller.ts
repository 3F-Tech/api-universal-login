import type { Request, Response } from 'express';
import * as systemsService from './service.js';
import {
  createSystemSchema,
  listSystemsQuerySchema,
  systemParamsSchema,
  updateSystemSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listSystemsQuerySchema.parse(req.query);
  const { data, total } = await systemsService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = systemParamsSchema.parse(req.params);
  sendItem(res, await systemsService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createSystemSchema.parse(req.body);
  sendItem(res, await systemsService.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = systemParamsSchema.parse(req.params);
  const input = updateSystemSchema.parse(req.body);
  sendItem(res, await systemsService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = systemParamsSchema.parse(req.params);
  await systemsService.remove(id);
  sendItem(res, { id, deleted: true });
}
