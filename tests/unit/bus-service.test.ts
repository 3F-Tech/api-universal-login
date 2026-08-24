import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `busService.create` monta o objeto `data` CAMPO A CAMPO (não faz spread do
 * input). É um gotcha real: um campo novo validado pelo Zod e esquecido ali é
 * descartado em silêncio — sem erro, sem log, e o cliente acha que gravou.
 * Estes testes travam esse contrato sem tocar o banco (Prisma mockado).
 */
vi.mock('../../src/config/database.js', () => ({
  prisma: {
    bu: {
      create: vi.fn(async ({ data }: { data: unknown }) => data),
      update: vi.fn(async ({ data }: { data: unknown }) => data),
    },
  },
}));

const { prisma } = await import('../../src/config/database.js');
const busService = await import('../../src/modules/bus/service.js');

const createMock = vi.mocked(prisma.bu.create);
const updateMock = vi.mocked(prisma.bu.update);

const CAMPOS_NOVOS = [
  'legal_name',
  'legal_nature',
  'cnpj',
  'email',
  'phone',
  'cep',
  'street',
  'street_number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'country',
  'email_domain',
] as const;

beforeEach(() => {
  createMock.mockClear();
  updateMock.mockClear();
});

describe('bus service — persistência dos campos de contrato', () => {
  it('create repassa todos os campos novos ao Prisma', async () => {
    await busService.create({
      name: 'Bomma',
      slug: 'bomma',
      legal_name: 'BOMMA ASSESSORIA DE MARKETING LTDA',
      legal_nature: 'Sociedade Empresária Limitada',
      cnpj: '12.345.678/0001-90',
      email: 'contato@bomma.com.br',
      phone: '(45) 99999-0000',
      cep: '85810-000',
      street: 'Av. Brasil',
      street_number: '123-A',
      complement: 'Sala 4',
      neighborhood: 'Centro',
      city: 'Cascavel',
      state: 'PR',
      country: 'Brasil',
      email_domain: 'bommamkt.com.br',
    });

    expect(createMock).toHaveBeenCalledOnce();
    const { data } = createMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data['legal_name']).toBe('BOMMA ASSESSORIA DE MARKETING LTDA');
    expect(data['street_number']).toBe('123-A');
    // Nenhum campo pode ter sido esquecido no mapeamento manual do service.
    for (const campo of CAMPOS_NOVOS) expect(data).toHaveProperty(campo);
  });

  it('create sem os campos novos não quebra (BU antiga continua criável)', async () => {
    await busService.create({ name: 'BU Simples', slug: 'bu-simples' });

    const { data } = createMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data['name']).toBe('BU Simples');
    for (const campo of CAMPOS_NOVOS) expect(data[campo]).toBeUndefined();
  });

  it('update repassa null (limpa a coluna) e não injeta campos omitidos', async () => {
    await busService.update(1, { city: null, legal_name: 'TESTE LTDA' });

    const { where, data } = updateMock.mock.calls[0]![0] as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(where).toEqual({ id: 1 });
    expect(data['city']).toBeNull();
    expect(data['legal_name']).toBe('TESTE LTDA');
    expect(data).not.toHaveProperty('cnpj');
    expect(data).not.toHaveProperty('name');
  });

  it('update só de name preserva o resto (nenhuma chave extra vai ao Prisma)', async () => {
    await busService.update(1, { name: 'Novo Nome' });

    const { data } = updateMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(Object.keys(data)).toEqual(['name']);
  });

  it('update rejeita a BU como pai dela mesma (não-regressão)', async () => {
    await expect(busService.update(1, { parent_id: 1 })).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
