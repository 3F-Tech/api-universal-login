import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const bandsRouter = Router();

bandsRouter.get('/bands', requireScope(SCOPES.bandsRead), controller.list);
bandsRouter.get('/bands/:id', requireScope(SCOPES.bandsRead), controller.getById);
bandsRouter.post('/bands', requireScope(SCOPES.bandsWrite), controller.create);
bandsRouter.patch('/bands/:id', requireScope(SCOPES.bandsWrite), controller.update);
bandsRouter.delete('/bands/:id', requireScope(SCOPES.bandsDelete), controller.remove);
