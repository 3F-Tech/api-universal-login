import { describe, expect, it } from 'vitest';
import { assignSpecialistBodySchema, MAX_BATCH_CLIENTS } from '../../src/modules/clients/schema.js';

describe('assignSpecialistBodySchema', () => {
  it('aceita specialist_id null (desvincula) com client_ids', () => {
    const parsed = assignSpecialistBodySchema.parse({ specialist_id: null, client_ids: [1, 2, 3] });
    expect(parsed.specialist_id).toBeNull();
    expect(parsed.client_ids).toEqual([1, 2, 3]);
  });

  it('aceita specialist_id numérico', () => {
    const parsed = assignSpecialistBodySchema.parse({ specialist_id: 42, client_ids: [7] });
    expect(parsed.specialist_id).toBe(42);
  });

  it('rejeita client_ids vazio', () => {
    expect(() => assignSpecialistBodySchema.parse({ specialist_id: 1, client_ids: [] })).toThrow();
  });

  it('rejeita client_ids acima do teto (MAX_BATCH_CLIENTS)', () => {
    const tooMany = Array.from({ length: MAX_BATCH_CLIENTS + 1 }, (_, i) => i + 1);
    expect(() =>
      assignSpecialistBodySchema.parse({ specialist_id: 1, client_ids: tooMany }),
    ).toThrow();
  });

  it('rejeita ids não-positivos', () => {
    expect(() => assignSpecialistBodySchema.parse({ specialist_id: 1, client_ids: [0] })).toThrow();
    expect(() =>
      assignSpecialistBodySchema.parse({ specialist_id: 1, client_ids: [-5] }),
    ).toThrow();
  });

  it('exige specialist_id presente (ausência é inválida; use null para desvincular)', () => {
    expect(() => assignSpecialistBodySchema.parse({ client_ids: [1] })).toThrow();
  });
});
