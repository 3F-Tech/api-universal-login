import type { Request, Response } from 'express';
import * as service from './service.js';
import {
  buIdParamSchema,
  linkBuBodySchema,
  replaceBusBodySchema,
  systemBuParamsSchema,
  systemIdParamSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta, paginationQuerySchema } from '../../utils/pagination.js';

export async function listBuIds(req: Request, res: Response): Promise<void> {
  const { systemId } = systemIdParamSchema.parse(req.params);
  sendItem(res, await service.getSystemBuIds(systemId));
}

export async function replaceBus(req: Request, res: Response): Promise<void> {
  const { systemId } = systemIdParamSchema.parse(req.params);
  const { bu_ids } = replaceBusBodySchema.parse(req.body);
  sendItem(res, await service.replaceSystemBus(systemId, bu_ids));
}

export async function link(req: Request, res: Response): Promise<void> {
  const { systemId } = systemIdParamSchema.parse(req.params);
  const { bu_id } = linkBuBodySchema.parse(req.body);
  sendItem(res, await service.linkBu(systemId, bu_id), 201);
}

export async function unlink(req: Request, res: Response): Promise<void> {
  const { systemId, buId } = systemBuParamsSchema.parse(req.params);
  sendItem(res, await service.unlinkBu(systemId, buId));
}

export async function listSystems(req: Request, res: Response): Promise<void> {
  const { buId } = buIdParamSchema.parse(req.params);
  const query = paginationQuerySchema.parse(req.query);
  const { data, total } = await service.listBuSystems(buId, query);
  sendList(res, data, buildMeta(total, query));
}
