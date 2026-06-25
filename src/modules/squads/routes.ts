import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const squadsRouter = Router();

squadsRouter.get('/squads', requireScope(SCOPES.squadsRead), controller.list);
squadsRouter.get('/squads/:id', requireScope(SCOPES.squadsRead), controller.getById);
// Usuários do squad. Exige users:read pois devolve dados de usuário (PII + BUs).
squadsRouter.get('/squads/:id/users', requireScope(SCOPES.usersRead), controller.listUsers);
// Membros enxutos (DTO já resolvido p/ o card de squad). Mesmo scope users:read (devolve PII).
squadsRouter.get('/squads/:id/members', requireScope(SCOPES.usersRead), controller.listMembers);
squadsRouter.post('/squads', requireScope(SCOPES.squadsWrite), controller.create);
squadsRouter.patch('/squads/:id', requireScope(SCOPES.squadsWrite), controller.update);
squadsRouter.delete('/squads/:id', requireScope(SCOPES.squadsDelete), controller.remove);
