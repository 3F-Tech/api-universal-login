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
// Vínculo em lote: dá acesso ao sistema a vários usuários de uma vez (idempotente).
systemsUsersRouter.post(
  '/systems/:systemId/users/batch',
  requireScope(SCOPES.systemsUsersWrite),
  controller.linkBatch,
);
// Unlink em lote: remove o acesso de vários usuários de uma vez (idempotente).
// ANTES de '/systems/:systemId/users/:userId' — senão "batch" casa como :userId.
systemsUsersRouter.delete(
  '/systems/:systemId/users/batch',
  requireScope(SCOPES.systemsUsersDelete),
  controller.unlinkBatch,
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
