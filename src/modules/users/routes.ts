import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const usersRouter = Router();

usersRouter.get('/users', requireScope(SCOPES.usersRead), controller.list);
// Fotos em lote por ids. ANTES de /users/:id — senão "photos" casa como :id.
usersRouter.get('/users/photos', requireScope(SCOPES.usersRead), controller.listPhotos);
usersRouter.get('/users/:id', requireScope(SCOPES.usersRead), controller.getById);
// Usuários liderados por :id (via user.leader_id) — lista leve, sem foto (igual /users).
usersRouter.get('/users/:id/led', requireScope(SCOPES.usersRead), controller.listLed);
usersRouter.post('/users', requireScope(SCOPES.usersWrite), controller.create);
usersRouter.patch('/users/:id', requireScope(SCOPES.usersWrite), controller.update);
usersRouter.delete('/users/:id', requireScope(SCOPES.usersDelete), controller.remove);
