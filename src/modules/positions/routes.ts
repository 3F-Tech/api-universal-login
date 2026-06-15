import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const positionsRouter = Router();

positionsRouter.get('/positions', requireScope(SCOPES.positionsRead), controller.list);
positionsRouter.get('/positions/:id', requireScope(SCOPES.positionsRead), controller.getById);
positionsRouter.post('/positions', requireScope(SCOPES.positionsWrite), controller.create);
positionsRouter.patch('/positions/:id', requireScope(SCOPES.positionsWrite), controller.update);
positionsRouter.delete('/positions/:id', requireScope(SCOPES.positionsDelete), controller.remove);
