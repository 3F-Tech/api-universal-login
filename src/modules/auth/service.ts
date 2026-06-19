import type { bu, user } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { verifyPassword } from '../../utils/bcrypt.js';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors.js';

export type SafeUser = Omit<user, 'password'>;
/** BU do usuário com o flag de origem (true = BU do squad, marcada pelo front). */
export type UserBu = bu & { from_squad: boolean };
/** Resposta do /auth/validate: usuário (sem senha) + suas BUs (N:N). */
export type ValidatedUser = SafeUser & { bus: UserBu[] };

/**
 * Valida credenciais (email + senha) para o sistema chamador (identificado pela
 * API Key). Regras acordadas:
 *  - user inexistente            -> 401 (sem log: não há vínculo pra registrar)
 *  - sem vínculo em systems_users -> 403 (sem log)
 *  - conta inativa (com vínculo)  -> registra success=false -> 403
 *  - senha errada (com vínculo)   -> registra success=false -> 401
 *  - tudo certo                   -> registra success=true  -> retorna o user
 *
 * Obs: `api_key.last_used_at` já é atualizado pelo middleware apiKeyAuth em toda
 * request autenticada, então não duplicamos a escrita aqui.
 */
export async function validateCredentials(
  email: string,
  password: string,
  systemId: number,
): Promise<ValidatedUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Credenciais inválidas.', { code: 'INVALID_CREDENTIALS' });
  }

  // Computa antes de agir (ordem do briefing), mas só registra se houver vínculo.
  const passwordOk = await verifyPassword(password, user.password);

  const link = await prisma.systems_users.findFirst({
    where: { system_id: systemId, user_id: user.id },
    select: { id: true },
  });
  if (!link) {
    throw new ForbiddenError('Usuário não tem acesso a este sistema.', {
      code: 'NO_SYSTEM_ACCESS',
    });
  }

  if (!user.is_active) {
    await registerAccess(link.id, false);
    throw new ForbiddenError('Conta desativada.', { code: 'ACCOUNT_INACTIVE' });
  }

  if (!passwordOk) {
    await registerAccess(link.id, false);
    throw new UnauthorizedError('Credenciais inválidas.', { code: 'INVALID_CREDENTIALS' });
  }

  await registerAccess(link.id, true);

  const links = await prisma.users_bus.findMany({
    where: { user_id: user.id },
    select: { from_squad: true, bu: true },
    orderBy: { bu_id: 'asc' },
  });

  const { password: _password, ...safeUser } = user;
  return { ...safeUser, bus: links.map(({ bu, from_squad }) => ({ ...bu, from_squad })) };
}

function registerAccess(systemsUsersId: number, success: boolean): Promise<unknown> {
  return prisma.systems_users_access.create({
    data: { systems_users_id: systemsUsersId, success },
  });
}
