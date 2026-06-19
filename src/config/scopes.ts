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

/**
 * Catálogo de "tipos" de API Key. O front pede um tipo (ex: `login`) e a API
 * traduz no conjunto de scopes correto — a regra de permissão fica centralizada
 * aqui, não nos sistemas consumidores. Para criar uma key, o cliente manda
 * `type`, nunca scopes crus (ver `modules/api-keys/schema.ts`).
 */
export const API_KEY_TYPES = {
  /** Acesso total à API. Para ferramentas internas de administração. */
  adm: {
    label: 'Administrador',
    description: 'Acesso total a toda a API.',
    scopes: [ADMIN_SCOPE],
  },
  /**
   * Sistema de login: valida credenciais (`auth:validate`) e lê os dados de
   * perfil que o usuário referencia (user/bu/system + cargo/depto/band/squad),
   * para resolver os IDs em nomes na tela de login.
   */
  login: {
    label: 'Login',
    description: 'Validação de login + leitura de user, bu, system e dados de perfil.',
    scopes: [
      SCOPES.authValidate,
      SCOPES.usersRead,
      SCOPES.busRead,
      SCOPES.systemsRead,
      SCOPES.positionsRead,
      SCOPES.departmentsRead,
      SCOPES.bandsRead,
      SCOPES.squadsRead,
    ],
  },
} as const;

/** Identificadores válidos de tipo de key (ex: `'adm' | 'login'`). */
export type ApiKeyType = keyof typeof API_KEY_TYPES;

/** Lista dos tipos válidos, útil para validação Zod e para o endpoint de catálogo. */
export const API_KEY_TYPE_NAMES = Object.keys(API_KEY_TYPES) as ApiKeyType[];

/** Expande um tipo de key no array de scopes correspondente. */
export function scopesForType(type: ApiKeyType): string[] {
  return [...API_KEY_TYPES[type].scopes];
}

/**
 * Caminho inverso: descobre o tipo de uma key a partir do conjunto de scopes
 * gravado. Útil para o front exibir "Login"/"Administrador" na listagem sem
 * reprocessar scopes. Retorna `null` se os scopes não baterem com nenhum tipo
 * conhecido (ex: uma key antiga com scopes customizados).
 */
export function typeForScopes(scopes: readonly string[]): ApiKeyType | null {
  const set = new Set(scopes);
  const match = API_KEY_TYPE_NAMES.find(
    (name) =>
      API_KEY_TYPES[name].scopes.length === set.size &&
      API_KEY_TYPES[name].scopes.every((s) => set.has(s)),
  );
  return match ?? null;
}
