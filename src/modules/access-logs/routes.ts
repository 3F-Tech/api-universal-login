import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const accessLogsRouter = Router();

accessLogsRouter.get(
  '/systems/:systemId/access-logs',
  requireScope(SCOPES.accessLogsRead),
  controller.listSystemLogs,
);
accessLogsRouter.get(
  '/users/:userId/access-logs',
  requireScope(SCOPES.accessLogsRead),
  controller.listUserLogs,
);
// Acessos de um usuário em UM sistema específico.
accessLogsRouter.get(
  '/systems/:systemId/users/:userId/access-logs',
  requireScope(SCOPES.accessLogsRead),
  controller.listUserSystemLogs,
);
accessLogsRouter.get('/access-logs/stats', requireScope(SCOPES.accessLogsRead), controller.stats);
// Usuários que erraram a senha no range (agregado por usuário; default = hoje).
accessLogsRouter.get(
  '/access-logs/wrong-password',
  requireScope(SCOPES.accessLogsRead),
  controller.wrongPasswordUsers,
);
// Lista individual (não agregada) de todos os acessos de hoje; filtro opcional bu_id.
accessLogsRouter.get('/access-logs/today', requireScope(SCOPES.accessLogsRead), controller.today);
