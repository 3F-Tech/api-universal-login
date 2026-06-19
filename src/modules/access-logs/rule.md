# rule.md — módulo `access-logs`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

Leitura (**read-only**) dos logs de tentativa de acesso/validação, persistidos na tabela
`systems_users_access`. Cada registro representa uma validação de credenciais (sucesso ou falha)
de um vínculo `systems_users` (par usuário↔sistema). Este módulo **só lista/consulta** — quem
**grava** os logs é o módulo `auth` (em `/auth/validate`). Não há create/update/delete aqui.

## Endpoints

Todos exigem header `X-API-Key` e o mesmo scope (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/systems/:systemId/access-logs` | `access-logs:read` | Logs de um sistema (filtros `user_id`, `success`, `from`, `to`; paginado) |
| GET | `/users/:userId/access-logs` | `access-logs:read` | Logs de um usuário (filtros `system_id`, `success`, `from`, `to`; paginado) |

> Só existe o scope `access-logs:read` (`SCOPES.accessLogsRead`). Não há write nem delete — logs
> são imutáveis pela API.

## Schema (Zod) — `schema.ts`

- **params:** `systemIdParamSchema` (`systemId`) e `userIdParamSchema` (`userId`) — ambos
  `z.coerce.number().int().positive()`.
- **filtros comuns** (`commonFilters`): `success` (`booleanQueryParam`, opcional), `from` e `to`
  (`z.coerce.date()`, opcionais) para faixa de datas em `accessed_at`.
- **system query** (`systemAccessLogsQuerySchema`): `paginationQuerySchema` + filtros comuns +
  `user_id` opcional (estreita os logs do sistema para um usuário).
- **user query** (`userAccessLogsQuerySchema`): `paginationQuerySchema` + filtros comuns +
  `system_id` opcional (estreita os logs do usuário para um sistema).
- Tipos exportados: `SystemAccessLogsQuery`, `UserAccessLogsQuery`.

## Regras de negócio

- Antes de consultar, valida a existência do recurso-âncora: `assertSystemExists(systemId)` /
  `assertUserExists(userId)` (`utils/references.ts`) → 404 limpo se não existir.
- Filtro por relação: o `where` filtra via `systems_users` (`{ systems_users: { system_id } }` /
  `{ user_id } }`), seguindo a convenção do projeto (filtrar por relação, não usar `include` de
  nomes frágeis para filtrar).
- Ordenação fixa: `accessed_at: 'desc'` (mais recentes primeiro).
- Faixa de datas opcional: `from` → `gte`, `to` → `lte` (`applyDateRange`).

## Service — `service.ts`

- `listSystemAccessLogs(systemId, query)` e `listUserAccessLogs(userId, query)`: montam o `where`,
  rodam `findMany` + `count` em paralelo (`Promise.all`) e retornam `{ data, total }`.
- `INCLUDE` traz apenas `systems_users: { select: { user_id, system_id } }` — só os ids do vínculo,
  para enriquecer cada row sem carregar relações inteiras. O tipo do row é `AccessLogRow`
  (`Prisma.systems_users_accessGetPayload<...>`).
- **`serialize(row)`**: projeta o shape de saída — `id` (string), `systems_users_id`, `user_id`,
  `system_id`, `success`, `accessed_at`. É aqui que o `BigInt` é convertido (ver Gotchas).
- Paginação via `toSkipTake(query)`; o controller monta o meta com `buildMeta(total, query)` e
  responde com `sendList`.

## Erros

- `400` — params/query inválidos (`systemId`/`userId` não positivos, datas inválidas) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem `access-logs:read`.
- `404` — `SYSTEM_NOT_FOUND` / `USER_NOT_FOUND` (âncora inexistente, via `assertSystemExists` /
  `assertUserExists`).

## Gotchas

- **`systems_users_access.id` é `BigInt`.** O `serialize` faz `row.id.toString()` — **obrigatório**,
  senão o `JSON.stringify` da resposta quebra (`TypeError: Do not know how to serialize a BigInt`).
  Qualquer campo BigInt novo precisa do mesmo tratamento.
- Read-only por design: não adicione rotas de escrita aqui — a gravação dos logs é responsabilidade
  exclusiva do módulo `auth` (`/auth/validate`).
- `user_id`/`system_id` na saída vêm do vínculo `systems_users` (via `INCLUDE`), não de colunas
  diretas de `systems_users_access`.
