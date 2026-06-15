import type { Request, Response } from 'express';
import * as squadsService from './service.js';
import {
  createSquadSchema,
  listSquadsQuerySchema,
  squadParamsSchema,
  updateSquadSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listSquadsQuerySchema.parse(req.query);
  const { data, total } = await squadsService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = squadParamsSchema.parse(req.params);
  sendItem(res, await squadsService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createSquadSchema.parse(req.body);
  sendItem(res, await squadsService.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = squadParamsSchema.parse(req.params);
  const input = updateSquadSchema.parse(req.body);
  sendItem(res, await squadsService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = squadParamsSchema.parse(req.params);
  await squadsService.remove(id);
  sendItem(res, { id, deleted: true });
}
