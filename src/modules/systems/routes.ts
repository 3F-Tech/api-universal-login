import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const systemsRouter = Router();

systemsRouter.get('/systems', requireScope(SCOPES.systemsRead), controller.list);
// Sistemas já com suas BUs embutidas (evita o N+1 de GET /systems/:id/bus por sistema).
// ANTES de '/systems/:id' — senão "with-bus" casa como :id.
systemsRouter.get('/systems/with-bus', requireScope(SCOPES.systemsRead), controller.listWithBus);
systemsRouter.get('/systems/:id', requireScope(SCOPES.systemsRead), controller.getById);
systemsRouter.post('/systems', requireScope(SCOPES.systemsWrite), controller.create);
systemsRouter.patch('/systems/:id', requireScope(SCOPES.systemsWrite), controller.update);
systemsRouter.delete('/systems/:id', requireScope(SCOPES.systemsDelete), controller.remove);
