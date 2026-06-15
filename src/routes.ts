import { Router } from 'express';
import { authRouter } from './modules/auth/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { apiKeysRouter } from './modules/api-keys/routes.js';
import { busRouter } from './modules/bus/routes.js';
import { squadsRouter } from './modules/squads/routes.js';
import { departmentsRouter } from './modules/departments/routes.js';
import { positionsRouter } from './modules/positions/routes.js';
import { bandsRouter } from './modules/bands/routes.js';
import { systemsRouter } from './modules/systems/routes.js';
import { systemsUsersRouter } from './modules/systems-users/routes.js';
import { systemsBusRouter } from './modules/systems-bus/routes.js';
import { accessLogsRouter } from './modules/access-logs/routes.js';

/**
 * Agrega todos os routers protegidos (montados depois de apiKeyAuth +
 * rateLimiter no app.ts). Cada router usa caminhos absolutos, então todos
 * montam na raiz. As rotas de relacionamento (systems-users, systems-bus,
 * access-logs) têm mais segmentos e não conflitam com os CRUDs base.
 */
export const apiRouter = Router();

apiRouter.use(authRouter);
apiRouter.use(usersRouter);
apiRouter.use(apiKeysRouter);
apiRouter.use(busRouter);
apiRouter.use(squadsRouter);
apiRouter.use(departmentsRouter);
apiRouter.use(positionsRouter);
apiRouter.use(bandsRouter);
apiRouter.use(systemsRouter);
apiRouter.use(systemsUsersRouter);
apiRouter.use(systemsBusRouter);
apiRouter.use(accessLogsRouter);
