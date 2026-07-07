import type { Request, Response } from 'express';
import * as service from './service.js';
import {
  accessLogStatsQuerySchema,
  accessLogTodayQuerySchema,
  systemAccessLogsQuerySchema,
  systemIdParamSchema,
  systemUserParamsSchema,
  userAccessLogsQuerySchema,
  userIdParamSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
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

export async function listUserSystemLogs(req: Request, res: Response): Promise<void> {
  const { systemId, userId } = systemUserParamsSchema.parse(req.params);
  const query = systemAccessLogsQuerySchema.parse(req.query);
  const { data, total } = await service.listUserSystemAccessLogs(systemId, userId, query);
  sendList(res, data, buildMeta(total, query));
}

export async function stats(req: Request, res: Response): Promise<void> {
  const query = accessLogStatsQuerySchema.parse(req.query);
  const data = await service.getAccessLogStats(query);
  sendItem(res, data);
}

export async function wrongPasswordUsers(req: Request, res: Response): Promise<void> {
  // Mesmo contrato de query do /stats (default de período = hoje, resolvido no service).
  const query = accessLogStatsQuerySchema.parse(req.query);
  const data = await service.getWrongPasswordUsers(query);
  sendItem(res, data);
}

export async function today(req: Request, res: Response): Promise<void> {
  const query = accessLogTodayQuerySchema.parse(req.query);
  const data = await service.getTodayAccessLogs(query);
  sendItem(res, data);
}
