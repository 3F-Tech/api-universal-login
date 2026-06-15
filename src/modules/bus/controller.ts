import type { Request, Response } from 'express';
import * as busService from './service.js';
import { buParamsSchema, createBuSchema, listBusQuerySchema, updateBuSchema } from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listBusQuerySchema.parse(req.query);
  const { data, total } = await busService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function tree(_req: Request, res: Response): Promise<void> {
  sendItem(res, await busService.tree());
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = buParamsSchema.parse(req.params);
  sendItem(res, await busService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createBuSchema.parse(req.body);
  sendItem(res, await busService.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = buParamsSchema.parse(req.params);
  const input = updateBuSchema.parse(req.body);
  sendItem(res, await busService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = buParamsSchema.parse(req.params);
  await busService.remove(id);
  sendItem(res, { id, deleted: true });
}
