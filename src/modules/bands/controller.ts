import type { Request, Response } from 'express';
import * as bandsService from './service.js';
import {
  bandParamsSchema,
  createBandSchema,
  listBandsQuerySchema,
  updateBandSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listBandsQuerySchema.parse(req.query);
  const { data, total } = await bandsService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = bandParamsSchema.parse(req.params);
  sendItem(res, await bandsService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createBandSchema.parse(req.body);
  sendItem(res, await bandsService.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = bandParamsSchema.parse(req.params);
  const input = updateBandSchema.parse(req.body);
  sendItem(res, await bandsService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = bandParamsSchema.parse(req.params);
  await bandsService.remove(id);
  sendItem(res, { id, deleted: true });
}
