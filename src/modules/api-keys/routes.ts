import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const apiKeysRouter = Router();

apiKeysRouter.get('/api-keys', requireScope(SCOPES.apiKeysRead), controller.list);
// Antes de '/api-keys/:id' para o param não capturar "types".
apiKeysRouter.get('/api-keys/types', requireScope(SCOPES.apiKeysRead), controller.listTypes);
apiKeysRouter.get('/api-keys/:id', requireScope(SCOPES.apiKeysRead), controller.getById);
apiKeysRouter.post('/api-keys', requireScope(SCOPES.apiKeysWrite), controller.create);
apiKeysRouter.patch('/api-keys/:id', requireScope(SCOPES.apiKeysWrite), controller.update);
apiKeysRouter.delete('/api-keys/:id', requireScope(SCOPES.apiKeysDelete), controller.remove);
