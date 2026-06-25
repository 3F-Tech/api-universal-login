import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';

/**
 * Smoke test por módulo: confirma que cada rota está montada E protegida.
 * Sem X-API-Key, o apiKeyAuth corta em 401 antes de tocar o banco — então
 * estes testes não dependem de conexão com o Postgres.
 */
const routes = [
  { method: 'get', path: '/users' }, // users
  { method: 'get', path: '/users/photos?ids=1' }, // users (fotos em lote)
  { method: 'post', path: '/auth/validate' }, // auth
  { method: 'get', path: '/api-keys' }, // api-keys
  { method: 'get', path: '/bus' }, // bus
  { method: 'get', path: '/squads' }, // squads
  { method: 'get', path: '/squads/1/members' }, // squads (membros enxutos)
  { method: 'get', path: '/departments' }, // departments
  { method: 'get', path: '/positions' }, // positions
  { method: 'get', path: '/bands' }, // bands
  { method: 'get', path: '/systems' }, // systems
  { method: 'get', path: '/systems/1/users' }, // systems-users
  { method: 'get', path: '/users/1/systems' }, // systems-users (inverso)
  { method: 'get', path: '/systems/1/bus' }, // systems-bus
  { method: 'get', path: '/bus/1/systems' }, // systems-bus (inverso)
  { method: 'get', path: '/systems/1/access-logs' }, // access-logs
  { method: 'get', path: '/users/1/access-logs' }, // access-logs (inverso)
] as const;

describe('Proteção por API Key (smoke por módulo)', () => {
  for (const { method, path } of routes) {
    it(`${method.toUpperCase()} ${path} sem X-API-Key → 401`, async () => {
      const res = method === 'get' ? await api.get(path) : await api.post(path).send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('API_KEY_MISSING');
    });
  }
});
