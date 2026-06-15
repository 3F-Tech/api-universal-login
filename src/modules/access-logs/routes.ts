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
