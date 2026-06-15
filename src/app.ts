import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiKeyAuth } from './middleware/api-key.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/routes.js';
import { apiRouter } from './routes.js';
import { NotFoundError } from './utils/errors.js';

/**
 * Monta a aplicação Express. Separado do server.ts para ser reutilizável em
 * testes (supertest) sem subir um socket.
 */
export function createApp(): Express {
  const app = express();

  // Atrás de Nginx/Caddy em produção, confia nos headers X-Forwarded-*.
  if (env.TRUST_PROXY) {
    app.set('trust proxy', true);
  }

  app.use(helmet());

  // CORS desabilitado por padrão (API backend-to-backend). Só liga se houver
  // origens explicitamente configuradas — nunca `*`.
  if (env.CORS_ORIGINS.length > 0) {
    app.use(cors({ origin: env.CORS_ORIGINS }));
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // Healthcheck público (sem API key).
  app.use('/health', healthRouter);

  // A partir daqui tudo exige API Key válida + passa pelo rate limit por key.
  app.use(apiKeyAuth);
  app.use(rateLimiter);
  app.use(apiRouter);

  // 404 padronizado para rotas não encontradas.
  app.use((req, _res, next) => {
    next(
      new NotFoundError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, {
        code: 'ROUTE_NOT_FOUND',
      }),
    );
  });

  app.use(errorHandler);

  return app;
}
