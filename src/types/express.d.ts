import type { api_key, system } from '@prisma/client';

// Aumenta o Request do Express com o contexto de autenticação injetado pelo
// middleware `apiKeyAuth`: a API Key validada e o sistema dono dela.
declare global {
  namespace Express {
    interface Request {
      apiKey?: api_key;
      system?: system;
    }
  }
}

export {};
