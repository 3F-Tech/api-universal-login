import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const departmentsRouter = Router();

departmentsRouter.get('/departments', requireScope(SCOPES.departmentsRead), controller.list);
departmentsRouter.get('/departments/:id', requireScope(SCOPES.departmentsRead), controller.getById);
// Cargos do departamento. Scope positions:read (devolve dados de position, não de department).
departmentsRouter.get(
  '/departments/:id/positions',
  requireScope(SCOPES.positionsRead),
  controller.listPositions,
);
// Usuários do departamento. Scope users:read (devolve dados de usuário, PII + BUs).
departmentsRouter.get(
  '/departments/:id/users',
  requireScope(SCOPES.usersRead),
  controller.listUsers,
);
departmentsRouter.post('/departments', requireScope(SCOPES.departmentsWrite), controller.create);
departmentsRouter.patch(
  '/departments/:id',
  requireScope(SCOPES.departmentsWrite),
  controller.update,
);
departmentsRouter.delete(
  '/departments/:id',
  requireScope(SCOPES.departmentsDelete),
  controller.remove,
);
