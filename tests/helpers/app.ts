import request from 'supertest';
import { createApp } from '../../src/app.js';

// App montado uma vez para os testes. Como os smoke tests não disparam queries,
// o pool do Postgres nunca é aberto (o adapter conecta de forma lazy).
export const app = createApp();
export const api = request(app);
