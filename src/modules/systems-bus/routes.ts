import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const systemsBusRouter = Router();

systemsBusRouter.get(
  '/systems/:systemId/bus',
  requireScope(SCOPES.systemsBusRead),
  controller.listBus,
);
systemsBusRouter.post(
  '/systems/:systemId/bus',
  requireScope(SCOPES.systemsBusWrite),
  controller.link,
);
systemsBusRouter.delete(
  '/systems/:systemId/bus/:buId',
  requireScope(SCOPES.systemsBusDelete),
  controller.unlink,
);
systemsBusRouter.get(
  '/bus/:buId/systems',
  requireScope(SCOPES.systemsBusRead),
  controller.listSystems,
);
