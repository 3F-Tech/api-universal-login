import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const usersRouter = Router();

usersRouter.get('/users', requireScope(SCOPES.usersRead), controller.list);
usersRouter.get('/users/:id', requireScope(SCOPES.usersRead), controller.getById);
usersRouter.post('/users', requireScope(SCOPES.usersWrite), controller.create);
usersRouter.patch('/users/:id', requireScope(SCOPES.usersWrite), controller.update);
usersRouter.delete('/users/:id', requireScope(SCOPES.usersDelete), controller.remove);
