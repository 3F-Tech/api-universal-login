/**
 * Catálogo de scopes de autorização das API Keys.
 *
 * Cada endpoint exige um scope (ex: `users:read`). Uma key só acessa o que
 * está em `api_key.scopes`. O super-scope `admin:*` libera tudo, e um scope
 * de recurso (ex: `users:*`) libera todas as ações daquele recurso.
 */
export const ADMIN_SCOPE = 'admin:*';

export const SCOPES = {
  authValidate: 'auth:validate',

  usersRead: 'users:read',
  usersWrite: 'users:write',
  usersDelete: 'users:delete',

  busRead: 'bus:read',
  busWrite: 'bus:write',
  busDelete: 'bus:delete',

  squadsRead: 'squads:read',
  squadsWrite: 'squads:write',
  squadsDelete: 'squads:delete',

  departmentsRead: 'departments:read',
  departmentsWrite: 'departments:write',
  departmentsDelete: 'departments:delete',

  positionsRead: 'positions:read',
  positionsWrite: 'positions:write',
  positionsDelete: 'positions:delete',

  bandsRead: 'bands:read',
  bandsWrite: 'bands:write',
  bandsDelete: 'bands:delete',

  systemsRead: 'systems:read',
  systemsWrite: 'systems:write',
  systemsDelete: 'systems:delete',

  apiKeysRead: 'api-keys:read',
  apiKeysWrite: 'api-keys:write',
  apiKeysDelete: 'api-keys:delete',

  systemsUsersRead: 'systems-users:read',
  systemsUsersWrite: 'systems-users:write',
  systemsUsersDelete: 'systems-users:delete',

  systemsBusRead: 'systems-bus:read',
  systemsBusWrite: 'systems-bus:write',
  systemsBusDelete: 'systems-bus:delete',

  accessLogsRead: 'access-logs:read',
} as const;

/** Lista achatada de todos os scopes válidos (útil pra validação/documentação). */
export const ALL_SCOPES: readonly string[] = [ADMIN_SCOPE, ...Object.values(SCOPES)];
