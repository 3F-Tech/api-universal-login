import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey } from '../../src/utils/api-key-generator.js';

describe('api-key-generator', () => {
  it('gera key com o prefixo informado e key_prefix de 12 chars', () => {
    const { key, keyHash, keyPrefix } = generateApiKey('3fc_test_');
    expect(key.startsWith('3fc_test_')).toBe(true);
    expect(keyPrefix).toHaveLength(12);
    expect(keyPrefix).toBe(key.slice(0, 12));
    expect(keyHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('hashApiKey é determinístico e produz SHA-256 hex', () => {
    expect(hashApiKey('minha-chave')).toBe(hashApiKey('minha-chave'));
    expect(hashApiKey('minha-chave')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('gera keys distintas a cada chamada', () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});
