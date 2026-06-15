import { describe, expect, it } from 'vitest';
import { hasScope } from '../../src/middleware/require-scope.js';

describe('hasScope', () => {
  it('admin:* libera qualquer scope', () => {
    expect(hasScope(['admin:*'], 'users:read')).toBe(true);
    expect(hasScope(['admin:*'], 'api-keys:delete')).toBe(true);
  });

  it('correspondência exata', () => {
    expect(hasScope(['users:read'], 'users:read')).toBe(true);
  });

  it('wildcard de recurso (users:*) cobre as ações do recurso', () => {
    expect(hasScope(['users:*'], 'users:write')).toBe(true);
    expect(hasScope(['users:*'], 'bus:read')).toBe(false);
  });

  it('nega quando o scope não está presente', () => {
    expect(hasScope(['bus:read'], 'users:read')).toBe(false);
    expect(hasScope([], 'users:read')).toBe(false);
  });
});
