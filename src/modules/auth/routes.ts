import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const authRouter = Router();

// POST /auth/validate — valida email+senha e registra o acesso em systems_users_access.
authRouter.post('/auth/validate', requireScope(SCOPES.authValidate), controller.validate);
