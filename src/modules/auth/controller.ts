import type { Request, Response } from 'express';
import { validateCredentialsSchema } from './schema.js';
import * as authService from './service.js';
import { sendItem } from '../../utils/http.js';
import { UnauthorizedError } from '../../utils/errors.js';

export async function validate(req: Request, res: Response): Promise<void> {
  const { email, password } = validateCredentialsSchema.parse(req.body);

  // Garantido pelo apiKeyAuth, mas estreitamos o tipo (system é opcional no Request).
  if (!req.system) {
    throw new UnauthorizedError('Contexto de sistema ausente.', { code: 'SYSTEM_CONTEXT_MISSING' });
  }

  const user = await authService.validateCredentials(email, password, req.system.id);
  sendItem(res, user);
}
