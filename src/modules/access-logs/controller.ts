import type { Request, Response } from 'express';
import * as service from './service.js';
import {
  systemAccessLogsQuerySchema,
  systemIdParamSchema,
  userAccessLogsQuerySchema,
  userIdParamSchema,
} from './schema.js';
import { sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function listSystemLogs(req: Request, res: Response): Promise<void> {
  const { systemId } = systemIdParamSchema.parse(req.params);
  const query = systemAccessLogsQuerySchema.parse(req.query);
  const { data, total } = await service.listSystemAccessLogs(systemId, query);
  sendList(res, data, buildMeta(total, query));
}

export async function listUserLogs(req: Request, res: Response): Promise<void> {
  const { userId } = userIdParamSchema.parse(req.params);
  const query = userAccessLogsQuerySchema.parse(req.query);
  const { data, total } = await service.listUserAccessLogs(userId, query);
  sendList(res, data, buildMeta(total, query));
}
