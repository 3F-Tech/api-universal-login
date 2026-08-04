import type { Request, Response } from 'express';
import * as service from './service.js';
import {
  assignSpecialistBodySchema,
  batchClientIdsBodySchema,
  clientDocumentParamSchema,
  clientParamsSchema,
  createClientSchema,
  listClientsQuerySchema,
  searchClientsQuerySchema,
  specialistIdParamSchema,
  squadIdParamSchema,
  updateClientSchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta, paginationQuerySchema } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listClientsQuerySchema.parse(req.query);
  const { data, total } = await service.list(query);
  sendList(res, data, buildMeta(total, query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = clientParamsSchema.parse(req.params);
  sendItem(res, await service.getById(id));
}

export async function getByDocument(req: Request, res: Response): Promise<void> {
  const { document } = clientDocumentParamSchema.parse(req.params);
  sendItem(res, await service.getByDocument(document));
}

export async function batch(req: Request, res: Response): Promise<void> {
  const { ids } = batchClientIdsBodySchema.parse(req.body);
  sendItem(res, await service.listByIds(ids));
}

export async function listBySquad(req: Request, res: Response): Promise<void> {
  const { squadId } = squadIdParamSchema.parse(req.params);
  const query = paginationQuerySchema.parse(req.query);
  const { data, total } = await service.listBySquad(squadId, query);
  sendList(res, data, buildMeta(total, query));
}

export async function listBySpecialist(req: Request, res: Response): Promise<void> {
  const { userId } = specialistIdParamSchema.parse(req.params);
  const query = paginationQuerySchema.parse(req.query);
  const { data, total } = await service.listBySpecialist(userId, query);
  sendList(res, data, buildMeta(total, query));
}

export async function search(req: Request, res: Response): Promise<void> {
  const query = searchClientsQuerySchema.parse(req.query);
  const { data, total } = await service.search(query);
  sendList(res, data, buildMeta(total, query));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createClientSchema.parse(req.body);
  sendItem(res, await service.create(input), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = clientParamsSchema.parse(req.params);
  const input = updateClientSchema.parse(req.body);
  sendItem(res, await service.update(id, input));
}

export async function assignSpecialist(req: Request, res: Response): Promise<void> {
  const { specialist_id, client_ids } = assignSpecialistBodySchema.parse(req.body);
  sendItem(res, await service.assignSpecialist(specialist_id, client_ids));
}
