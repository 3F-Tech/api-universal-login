import { describe, expect, it } from 'vitest';
import { createBuSchema, updateBuSchema } from '../../src/modules/bus/schema.js';

/**
 * Cobre os campos de identidade jurídica + endereço da BU (2026-08-21), que são
 * consumidos por sistemas de contrato — a BU é a parte CONTRATANTE. O ponto
 * sensível é a semântica do PATCH: `null` precisa SOBREVIVER ao parse (é o que
 * manda o Prisma gravar NULL), e campo omitido precisa NÃO aparecer no objeto
 * parseado (senão o update apagaria dado que ninguém pediu para apagar).
 */
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
] as const;

const BU_COMPLETA = {
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
};

describe('bus schema — identidade jurídica e endereço', () => {
  it('nenhum campo novo virou obrigatório no create', () => {
    expect(createBuSchema.parse({ name: 'BU', slug: 'bu-x' })).toEqual({
      name: 'BU',
      slug: 'bu-x',
    });
  });

  it('create aceita os 13 campos novos', () => {
    expect(createBuSchema.parse(BU_COMPLETA)).toEqual(BU_COMPLETA);
  });

  it('create aceita null em todos os campos novos (colunas nullable)', () => {
    const nulos = Object.fromEntries(CAMPOS_NOVOS.map((c) => [c, null]));
    const parsed = createBuSchema.parse({ name: 'BU', slug: 'bu-x', ...nulos });
    for (const campo of CAMPOS_NOVOS) expect(parsed[campo]).toBeNull();
  });

  it('normaliza email para minúsculas e faz trim (mesma convenção de users)', () => {
    const parsed = createBuSchema.parse({
      name: 'BU',
      slug: 'bu-x',
      email: '  Contato@Bomma.COM.br  ',
    });
    expect(parsed.email).toBe('contato@bomma.com.br');
  });

  it('rejeita email malformado', () => {
    expect(() =>
      createBuSchema.parse({ name: 'BU', slug: 'bu-x', email: 'nao-e-email' }),
    ).toThrow();
  });

  // --- Semântica do PATCH (o requisito que o consumidor depende) ---

  it('PATCH com null PRESERVA o null (limpa a coluna, não vira undefined)', () => {
    expect(updateBuSchema.parse({ city: null })).toEqual({ city: null });
  });

  it('PATCH com campo omitido não injeta a chave (não apaga o que já está salvo)', () => {
    const parsed = updateBuSchema.parse({ name: 'Nova BU' });
    expect(parsed).toEqual({ name: 'Nova BU' });
    for (const campo of CAMPOS_NOVOS) expect(parsed).not.toHaveProperty(campo);
  });

  it('PATCH limpa vários campos de uma vez sem afetar os omitidos', () => {
    const parsed = updateBuSchema.parse({ legal_name: 'TESTE LTDA', city: null });
    expect(parsed).toEqual({ legal_name: 'TESTE LTDA', city: null });
    expect(parsed).not.toHaveProperty('cnpj');
  });

  // --- Limites de coluna (evita erro cru do Postgres em vez de 400 legível) ---

  it.each([
    ['cnpj', 19],
    ['email', 151],
    ['phone', 21],
    ['cep', 10],
    ['street', 201],
    ['street_number', 21],
    ['complement', 201],
    ['neighborhood', 101],
    ['city', 101],
    ['state', 51],
    ['country', 51],
  ])('rejeita %s acima do limite da coluna', (campo, tamanho) => {
    // email precisa continuar sendo um e-mail válido, senão o teste passaria
    // pelo motivo errado (formato) em vez de pelo limite de tamanho.
    const valor =
      campo === 'email' ? `${'a'.repeat(tamanho - 12)}@exemplo.com` : 'x'.repeat(tamanho);
    expect(updateBuSchema.safeParse({ [campo]: valor }).success).toBe(false);
  });

  it('legal_name e legal_nature não têm limite (são text no banco)', () => {
    const longo = 'A'.repeat(5000);
    const parsed = updateBuSchema.parse({ legal_name: longo, legal_nature: longo });
    expect(parsed.legal_name).toHaveLength(5000);
    expect(parsed.legal_nature).toHaveLength(5000);
  });

  // --- Não-regressão dos campos que já existiam ---

  it('mantém as validações antigas (slug e cores)', () => {
    expect(() => createBuSchema.parse({ name: 'BU', slug: 'Slug Inválido' })).toThrow();
    expect(() =>
      createBuSchema.parse({ name: 'BU', slug: 'bu-x', primary_color_hex: 'vermelho' }),
    ).toThrow();
  });
});
