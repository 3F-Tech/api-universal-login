import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';

describe('GET /health', () => {
  it('responde 200 sem autenticação', async () => {
    const res = await api.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('api-universal-login');
  });
});
