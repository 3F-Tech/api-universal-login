import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const busRouter = Router();

busRouter.get('/bus', requireScope(SCOPES.busRead), controller.list);
// /bus/tree antes de /bus/:id para não casar "tree" como id.
busRouter.get('/bus/tree', requireScope(SCOPES.busRead), controller.tree);
busRouter.get('/bus/:id', requireScope(SCOPES.busRead), controller.getById);
busRouter.post('/bus', requireScope(SCOPES.busWrite), controller.create);
busRouter.patch('/bus/:id', requireScope(SCOPES.busWrite), controller.update);
busRouter.delete('/bus/:id', requireScope(SCOPES.busDelete), controller.remove);
