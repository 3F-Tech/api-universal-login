import type { Request, Response } from 'express';
import * as positionsService from './service.js';
import {
  createPositionSchema,
  listPositionsQuerySchema,
  positionParamsSchema,
  updatePositionSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listPositionsQuerySchema.parse(req.query);
  const { data, total } = await positionsService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = positionParamsSchema.parse(req.params);
  sendItem(res, await positionsService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createPositionSchema.parse(req.body);
  sendItem(res, await positionsService.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = positionParamsSchema.parse(req.params);
  const input = updatePositionSchema.parse(req.body);
  sendItem(res, await positionsService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = positionParamsSchema.parse(req.params);
  await positionsService.remove(id);
  sendItem(res, { id, deleted: true });
}
