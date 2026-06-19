import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const systemsUsersRouter = Router();

systemsUsersRouter.get(
  '/systems/:systemId/users',
  requireScope(SCOPES.systemsUsersRead),
  controller.listUsers,
);
systemsUsersRouter.post(
  '/systems/:systemId/users',
  requireScope(SCOPES.systemsUsersWrite),
  controller.link,
);
systemsUsersRouter.delete(
  '/systems/:systemId/users/:userId',
  requireScope(SCOPES.systemsUsersDelete),
  controller.unlink,
);
systemsUsersRouter.get(
  '/users/:userId/systems',
  requireScope(SCOPES.systemsUsersRead),
  controller.listSystemAccess,
);
systemsUsersRouter.put(
  '/users/:userId/systems',
  requireScope(SCOPES.systemsUsersWrite),
  controller.replaceSystems,
);
