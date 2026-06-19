/**
 * Factories de payloads para testes. São builders puros (não tocam o banco) —
 * a estrutura está pronta para os testes de integração que rodarão contra um
 * Postgres de teste no futuro.
 */
let seq = 0;
const uniq = (): number => (seq += 1);

export function buildSystemInput(overrides: Record<string, unknown> = {}) {
  return { name: `System ${uniq()}`, description: 'Sistema de teste', ...overrides };
}

export function buildUserInput(overrides: Record<string, unknown> = {}) {
  const n = uniq();
  return {
    name: `Test User ${n}`,
    email: `user-${n}@3fventure.com.br`,
    password: 'password123',
    role: 'collaborator',
    ...overrides,
  };
}

export function buildBuInput(overrides: Record<string, unknown> = {}) {
  const n = uniq();
  return { name: `BU ${n}`, slug: `bu-${n}`, ...overrides };
}

export function buildApiKeyInput(
  systemId: number,
  createdBy: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    system_id: systemId,
    name: `key-${uniq()}`,
    type: 'login',
    created_by: createdBy,
    ...overrides,
  };
}
