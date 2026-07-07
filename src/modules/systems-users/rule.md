# rule.md — módulo `systems-users`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

Gerencia o **vínculo N:N entre `user` e `system`** (tabela `systems_users`, com UNIQUE composto
`system_id` + `user_id`). Cada vínculo carrega uma coluna **`role`** — o papel do usuário **naquele
sistema específico**. É exatamente este vínculo que o `/auth/validate` consulta para decidir se um
usuário tem acesso ao sistema (sem vínculo → 403).

O módulo expõe duas visões:

- **Por sistema** (`/systems/:systemId/users`): lista/vincula/desvincula usuários de um sistema.
- **Por usuário** (`/users/:userId/systems`): lê os acessos do usuário e os **substitui em bloco**.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/systems/:systemId/users` | `systems-users:read` | Usuários vinculados ao sistema (objetos `user` completos, paginado) |
| POST | `/systems/:systemId/users` | `systems-users:write` | Vincula um usuário ao sistema (201) |
| POST | `/systems/:systemId/users/batch` | `systems-users:write` | Vincula **vários** usuários ao sistema numa tacada (idempotente, 201) |
| DELETE | `/systems/:systemId/users/batch` | `systems-users:delete` | Remove o acesso de **vários** usuários numa tacada (idempotente) |
| DELETE | `/systems/:systemId/users/:userId` | `systems-users:delete` | Remove o vínculo (**hard delete**) |
| GET | `/users/:userId/systems` | `systems-users:read` | Acessos do usuário — pivot `{ system_id, role }` (**sem paginação**) |
| PUT | `/users/:userId/systems` | `systems-users:write` | **Substitui** todos os acessos do usuário em uma transação |

> Os scopes vêm de `SCOPES.systemsUsersRead` / `systemsUsersWrite` / `systemsUsersDelete`
> (`src/config/scopes.ts`).

## Schema (Zod) — `schema.ts`

- Helper `id = z.coerce.number().int().positive()` — params e ids do body são coeridos pra número.
- **params**: `systemIdParamSchema` (`systemId`), `userIdParamSchema` (`userId`),
  `systemUserParamsSchema` (`systemId` + `userId`).
- **link body** (`linkUserBodySchema`): `user_id` (obrigatório); `created_by` (opcional) é **aceito
  por compatibilidade de contrato mas NÃO persistido** — a tabela `systems_users` não tem coluna
  `created_by`.
- **batch body** (`batchUserIdsBodySchema`, usado por link **e** unlink em lote): `user_ids` — array
  de ids positivos, **min 1**, **máx `MAX_BATCH_USERS`=100** por requisição. Deduplicado no service.
  No link, os vínculos são criados com `role` nulo (como o link único).
- **replace body** (`replaceSystemsBodySchema`): `systems` é um array de `{ system_id, role }`,
  com `role` string não-vazia (`min(1)`) **ou `null`** — a chave é obrigatória por item, mas o valor
  aceita `null` (coluna nullable; front manda `null` pra sistema sem papel específico). Corrigido em
  2026-07-07 (antes rejeitava `null` com `VALIDATION_ERROR`, quebrando o `PUT` sempre que algum item
  do array não tinha papel definido).
- Paginação (`listUsers`) usa `paginationQuerySchema` do `utils/pagination.js` (não está no `schema.ts`).

## Regras de negócio

- **`role` por vínculo:** o papel é específico daquele par user↔system. Vai no body do `PUT`
  (`replaceSystems`), aceitando `null` (sem papel definido); no `POST` (`link`) **não** é informado —
  o vínculo é criado com `role` nulo (a coluna é nullable, sem default).
- **`link` é idempotente-falho:** vincular um par já existente viola o UNIQUE composto → `409`.
- **`linkUsers` (batch) é idempotente-tolerante:** ao contrário do `link` único, usuários já
  vinculados **não** geram `409` — são ignorados e devolvidos em `already_linked`. Valida o sistema
  e a existência de **todos** os `user_ids` antes de inserir (um `findMany` só); se algum id não
  existir → `404 USER_NOT_FOUND` com `details.missing` listando os ausentes. Insere os novos com
  `createMany({ skipDuplicates: true })` (guarda contra corrida). Vínculos criados com `role` nulo.
- **`unlinkUsers` (batch) é idempotente/tolerante:** remove o acesso de vários usuários; quem **não**
  tinha vínculo (ou nem existe) **não** é erro — cai em `not_linked`. **Não valida existência de
  user** de propósito: remover é no-op pra quem não tem vínculo (mesmo efeito prático). Valida só o
  sistema (404 `SYSTEM_NOT_FOUND`). Contraste com o **link** batch, que **exige** que todos os users
  existam — dar acesso a um id fantasma é erro; tirar acesso de um id fantasma é inócuo.
- **`replaceSystems` é destrutivo e atômico:** apaga TODOS os vínculos do usuário e reinsere a lista
  recebida, numa única transação. Deduplica por `system_id` (último vence, via `Map`) e valida a
  existência de cada sistema **antes** de abrir a transação.
- **Referências validadas antes:** `assertSystemExists` / `assertUserExists` (`utils/references.ts`)
  garantem `404` limpo antes de tocar no banco.
- **DELETE = hard delete**, alinhado à regra global.

## Service — `service.ts`

- `USER_SAFE_OMIT = { password: true, profile_picture: true }` em `listSystemUsers`: senha e foto de
  perfil nunca saem dessa listagem — mesmo motivo do `LIST_OMIT` de `users` (foto base64 inline,
  ~1-2MB/usuário, deixava a rota lentíssima). Corrigido em 2026-07-06 (antes só omitia `password`,
  e `/systems/:id/users` chegou a levar ~12s pra 64 usuários). Pra foto, use `GET /users/photos?ids=...`.
- `listSystemUsers(systemId, query)`: valida o sistema; filtra `user` por relação
  (`{ systems_users: { some: { system_id } } }`), ordenado por `name asc`, paginado. Retorna `{ data, total }`.
- `linkUser(systemId, userId)`: valida ambos; `prisma.systems_users.create`. Captura Prisma `P2002`
  → `ConflictError('ALREADY_LINKED')`.
- `linkUsers(systemId, userIds)`: batch. Valida o sistema + todos os usuários (um `findMany`, 404
  `USER_NOT_FOUND` com `details.missing`); calcula quais já estão vinculados (`findMany`) e insere só
  os novos (`createMany({ skipDuplicates: true })`). Retorna `{ system_id, linked, already_linked,
  count }` (arrays de ids ordenados; `count` = nº de vínculos novos criados).
- `unlinkUser(systemId, userId)`: `deleteMany` por `system_id` + `user_id`; se `count === 0` →
  `NotFoundError('LINK_NOT_FOUND')`. Retorna `{ system_id, user_id, deleted: true }`.
- `unlinkUsers(systemId, userIds)`: batch. Valida só o sistema; descobre quais ids têm vínculo
  (`findMany`) e apaga esses (`deleteMany` por `user_id in […]`). Retorna `{ system_id, unlinked,
  not_linked, count }` (arrays ordenados; `not_linked` = ids sem vínculo, incluindo inexistentes).
- `getUserSystemAccess(userId)`: valida o usuário; `prisma.systems_users.findMany` com
  `select: { system_id, role }` ordenado por `system_id`. Retorna `{ system_id, role }[]`
  (`role` pode ser `null`). É a função usada pela rota `GET /users/:userId/systems`
  (via `controller.listSystemAccess`).
- `replaceUserSystems(userId, systems)`: valida usuário + cada sistema; numa `$transaction`,
  `deleteMany` dos vínculos do usuário e recria com `createMany` (`{ system_id, user_id, role }`).
  Devolve a pivot final (`findMany` tipado).

## Erros

- `400` — params/body inválidos (ex.: `systemId` não numérico, `systems[].role` string vazia — `null`
  é aceito) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404` — `SYSTEM_NOT_FOUND` / `USER_NOT_FOUND` (referências inexistentes) ou
  `LINK_NOT_FOUND` (unlink sem vínculo).
- `409 ALREADY_LINKED` — `POST` de um par user↔system já vinculado (UNIQUE composto, Prisma `P2002`).

## Gotchas

- **`role` é nullable:** `link` (POST) cria o vínculo sem `role` (fica `null`); só o `PUT`
  (`replaceUserSystems`) define `role`. Por isso `getUserSystemAccess` retorna `role: string | null`.
- **`PUT` substitui, não faz merge:** qualquer acesso ausente no array é removido. Mande a lista completa.
- **`created_by` no `link` é descartado** — está no Zod só pra não quebrar clientes que o enviam.
