import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const squadsRouter = Router();

squadsRouter.get('/squads', requireScope(SCOPES.squadsRead), controller.list);
squadsRouter.get('/squads/:id', requireScope(SCOPES.squadsRead), controller.getById);
squadsRouter.post('/squads', requireScope(SCOPES.squadsWrite), controller.create);
squadsRouter.patch('/squads/:id', requireScope(SCOPES.squadsWrite), controller.update);
squadsRouter.delete('/squads/:id', requireScope(SCOPES.squadsDelete), controller.remove);
