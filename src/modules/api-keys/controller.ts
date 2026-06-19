import type { Request, Response } from 'express';
import * as apiKeysService from './service.js';
import {
  apiKeyParamsSchema,
  createApiKeySchema,
  listApiKeysQuerySchema,
  updateApiKeySchema,
} from './schema.js';
import { sendItem, sendList } from '../../utils/http.js';
import { buildMeta } from '../../utils/pagination.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listApiKeysQuerySchema.parse(req.query);
  const { data, total } = await apiKeysService.list(query);
  sendList(res, data, buildMeta(total, query));
}

export function listTypes(_req: Request, res: Response): void {
  const types = apiKeysService.listTypes();
  sendList(res, types, { total: types.length, page: 1, perPage: types.length });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = apiKeyParamsSchema.parse(req.params);
  sendItem(res, await apiKeysService.getById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createApiKeySchema.parse(req.body);
  const { apiKey, plainKey } = await apiKeysService.create(input);
  // `key` é mostrada só agora; depois disso só o hash existe no banco.
  sendItem(
    res,
    {
      ...apiKey,
      key: plainKey,
      _warning: 'Guarde esta key agora. Ela não poderá ser recuperada novamente.',
    },
    201,
  );
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = apiKeyParamsSchema.parse(req.params);
  const input = updateApiKeySchema.parse(req.body);
  sendItem(res, await apiKeysService.update(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = apiKeyParamsSchema.parse(req.params);
  await apiKeysService.remove(id);
  sendItem(res, { id, deleted: true });
}
