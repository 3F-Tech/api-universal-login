import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQueryParam } from '../../utils/zod.js';

const id = z.coerce.number().int().positive();

export const clientParamsSchema = z.object({ id });
export const clientDocumentParamSchema = z.object({ document: z.string().trim().min(1) });
export const squadIdParamSchema = z.object({ squadId: id });
export const specialistIdParamSchema = z.object({ userId: id });

// Convenção (CLAUDE.md): query só carrega `is_active` + paginação. status/squad_id/
// specialist_id/busca por nome-documento viram ROTAS dedicadas (ver routes.ts), não params.
export const listClientsQuerySchema = paginationQuerySchema.extend({
  is_active: booleanQueryParam.optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

// GET /clients/search?q= — busca dedicada por name/document (ILIKE). Rota própria em
// vez de query param `?q=` na listagem principal, seguindo a mesma convenção acima.
export const searchClientsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(150),
});
export type SearchClientsQuery = z.infer<typeof searchClientsQuerySchema>;

// POST /clients/batch — mata o N+1 do sistema_gestao ao hidratar clientes por id.
export const MAX_BATCH_CLIENTS = 200;

export const batchClientIdsBodySchema = z.object({
  ids: z
    .array(id)
    .min(1, 'Informe ao menos um id em "ids".')
    .max(MAX_BATCH_CLIENTS, `Máximo de ${MAX_BATCH_CLIENTS} ids por requisição.`),
});
export type BatchClientIdsBody = z.infer<typeof batchClientIdsBodySchema>;

export const CLIENT_TYPES = ['pf', 'pj'] as const;
export const CLIENT_STATUSES = ['active', 'churn', 'em_cancelamento'] as const;

/**
 * `type`/`status` têm CHECK constraint no banco, mas o Prisma não expõe CHECK como
 * enum (introspecta como `varchar` cru) — por isso a validação de valores permitidos
 * fica aqui no Zod, não só na constraint (evita um 500/P2xxx cru em vez de 400 legível).
 *
 * ⚠️ Os `.max()` das colunas `text` são bound DEFENSIVO do app (o banco não limita).
 * Foram calibrados contra o máximo real dos 293 registros migrados (medido em
 * 2026-07-30) com folga, para um round-trip GET→PATCH do front nunca ser rejeitado
 * por dado legítimo já existente. Máximos reais na época: name 108, document 14,
 * email 42, phone 16, instagram 77, cep 9, logradouro 72, `numero` **51**, bairro 54,
 * cidade 23, uf 2, representative_name 51, representative_cpf 11,
 * representative_email 42, complement vazio. Ao apertar qualquer um destes, confira
 * o dado real primeiro — `numero` chegando a 51 chars (endereços tipo "Quadra X Lote
 * Y") já invalidou um cap de 20 que parecia óbvio.
 */
export const createClientSchema = z.object({
  type: z.enum(CLIENT_TYPES),
  name: z.string().trim().min(1).max(200),
  document: z.string().trim().min(1).max(30),
  email: z.string().trim().toLowerCase().email().max(150).nullish(),
  phone: z.string().trim().max(30).nullish(),
  instagram: z.string().trim().max(200).nullish(),
  cep: z.string().trim().max(9).nullish(),
  logradouro: z.string().trim().max(200).nullish(),
  numero: z.string().trim().max(100).nullish(),
  complement: z.string().trim().max(200).nullish(),
  bairro: z.string().trim().max(100).nullish(),
  cidade: z.string().trim().max(100).nullish(),
  uf: z.string().trim().toUpperCase().max(2).nullish(),
  representative_name: z.string().trim().max(200).nullish(),
  representative_cpf: z.string().trim().max(14).nullish(),
  representative_email: z.string().trim().toLowerCase().email().max(150).nullish(),
  status: z.enum(CLIENT_STATUSES).optional(),
  // FKs nullable no banco — null limpa o vínculo, ausência não mexe (no update).
  squad_id: id.nullish(),
  specialist_id: id.nullish(),
  logo_picture: z.string().trim().nullish(),
  is_active: z.boolean().optional(),
  // Diferente de department/position/band/api_key: aqui NÃO é exigido pela regra de
  // negócio (não está na lista travada do CLAUDE.md) — opcional, validado se enviado.
  created_by: id.optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

// created_by não é alterável via update (definido só na criação, igual department/position/band).
export const updateClientSchema = createClientSchema.omit({ created_by: true }).partial();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
