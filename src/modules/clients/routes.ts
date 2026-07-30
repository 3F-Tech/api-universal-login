import { Router } from 'express';
import * as controller from './controller.js';
import { requireScope } from '../../middleware/require-scope.js';
import { SCOPES } from '../../config/scopes.js';

export const clientsRouter = Router();

// Rotas específicas ANTES de /clients/:id — senão o :id captura o segmento
// ("search"/"batch"/"by-document" cairiam no parse numérico e dariam 400).
clientsRouter.get('/clients/search', requireScope(SCOPES.clientsRead), controller.search);
clientsRouter.get(
  '/clients/by-document/:document',
  requireScope(SCOPES.clientsRead),
  controller.getByDocument,
);
// Batch é POST (body carrega o array de ids), mas semanticamente é LEITURA em lote —
// mata o N+1 do sistema_gestao ao hidratar clientes por id. Scope de read, não write.
clientsRouter.post('/clients/batch', requireScope(SCOPES.clientsRead), controller.batch);

clientsRouter.get('/clients', requireScope(SCOPES.clientsRead), controller.list);
clientsRouter.get('/clients/:id', requireScope(SCOPES.clientsRead), controller.getById);
clientsRouter.post('/clients', requireScope(SCOPES.clientsWrite), controller.create);
clientsRouter.patch('/clients/:id', requireScope(SCOPES.clientsWrite), controller.update);
// Sem DELETE de propósito: churn é histórico financeiro (contract_churns/spiced referenciam
// client_id sem FK cross-banco) — desativação é só PATCH { is_active: false }.

// Views aninhadas (client filtrado por squad_id/specialist_id) — mesmo padrão de
// /users/:id/led. Convenção do CLAUDE.md: filtro por FK vira rota, não query param.
clientsRouter.get(
  '/squads/:squadId/clients',
  requireScope(SCOPES.clientsRead),
  controller.listBySquad,
);
clientsRouter.get(
  '/users/:userId/clients',
  requireScope(SCOPES.clientsRead),
  controller.listBySpecialist,
);
