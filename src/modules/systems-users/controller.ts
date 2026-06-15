import type { Request, Response } from 'express';
import * as service from './service.js';
import {
  linkUserBodySchema,
  systemIdParamSchema,
  systemUserParamsSchema,
  userIdParamSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta, paginationQuerySchema } from '../../utils/pagination.js';

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { systemId } = systemIdParamSchema.parse(req.params);
  const query = paginationQuerySchema.parse(req.query);
  const { data, total } = await service.listSystemUsers(systemId, query);
  sendList(res, data, buildMeta(total, query));
}

export async function link(req: Request, res: Response): Promise<void> {
  const { systemId } = systemIdParamSchema.parse(req.params);
  const { user_id } = linkUserBodySchema.parse(req.body);
  sendItem(res, await service.linkUser(systemId, user_id), 201);
}

export async function unlink(req: Request, res: Response): Promise<void> {
  const { systemId, userId } = systemUserParamsSchema.parse(req.params);
  sendItem(res, await service.unlinkUser(systemId, userId));
}

export async function listSystems(req: Request, res: Response): Promise<void> {
  const { userId } = userIdParamSchema.parse(req.params);
  const query = paginationQuerySchema.parse(req.query);
  const { data, total } = await service.listUserSystems(userId, query);
  sendList(res, data, buildMeta(total, query));
}
