import type { Request, Response } from 'express';
import * as usersService from './service.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userParamsSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listUsersQuerySchema.parse(req.query);
  const { data, total } = await usersService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = userParamsSchema.parse(req.params);
  sendItem(res, await usersService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createUserSchema.parse(req.body);
  sendItem(res, await usersService.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = userParamsSchema.parse(req.params);
  const input = updateUserSchema.parse(req.body);
  sendItem(res, await usersService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = userParamsSchema.parse(req.params);
  await usersService.remove(id);
  sendItem(res, { id, deleted: true });
}
