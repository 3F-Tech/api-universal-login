import { Router } from 'express';
import { health, ready } from './controller.js';

// Sem autenticação (montado antes do apiKeyAuth no app.ts).
export const healthRouter = Router();

healthRouter.get('/', health);
healthRouter.get('/ready', ready);
