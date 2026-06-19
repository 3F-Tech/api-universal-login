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
- **replace body** (`replaceSystemsBodySchema`): `systems` é um array de `{ system_id, role }`,
  com `role` sendo string não-vazia (`min(1)`).
- Paginação (`listUsers`) usa `paginationQuerySchema` do `utils/pagination.js` (não está no `schema.ts`).

## Regras de negócio

- **`role` por vínculo:** o papel é específico daquele par user↔system. Vai no body do `PUT`
  (`replaceSystems`); no `POST` (`link`) **não** é informado — o vínculo é criado com `role` nulo
  (a coluna é nullable, sem default).
- **`link` é idempotente-falho:** vincular um par já existente viola o UNIQUE composto → `409`.
- **`replaceSystems` é destrutivo e atômico:** apaga TODOS os vínculos do usuário e reinsere a lista
  recebida, numa única transação. Deduplica por `system_id` (último vence, via `Map`) e valida a
  existência de cada sistema **antes** de abrir a transação.
- **Referências validadas antes:** `assertSystemExists` / `assertUserExists` (`utils/references.ts`)
  garantem `404` limpo antes de tocar no banco.
- **DELETE = hard delete**, alinhado à regra global.

## Service — `service.ts`

- `USER_SAFE_OMIT = { password: true }` em `listSystemUsers`: senha nunca sai nas listagens de usuário.
- `listSystemUsers(systemId, query)`: valida o sistema; filtra `user` por relação
  (`{ systems_users: { some: { system_id } } }`), ordenado por `name asc`, paginado. Retorna `{ data, total }`.
- `linkUser(systemId, userId)`: valida ambos; `prisma.systems_users.create`. Captura Prisma `P2002`
  → `ConflictError('ALREADY_LINKED')`.
- `unlinkUser(systemId, userId)`: `deleteMany` por `system_id` + `user_id`; se `count === 0` →
  `NotFoundError('LINK_NOT_FOUND')`. Retorna `{ system_id, user_id, deleted: true }`.
- `getUserSystemAccess(userId)`: valida o usuário; `prisma.systems_users.findMany` com
  `select: { system_id, role }` ordenado por `system_id`. Retorna `{ system_id, role }[]`
  (`role` pode ser `null`). É a função usada pela rota `GET /users/:userId/systems`
  (via `controller.listSystemAccess`).
- `replaceUserSystems(userId, systems)`: valida usuário + cada sistema; numa `$transaction`,
  `deleteMany` dos vínculos do usuário e recria com `createMany` (`{ system_id, user_id, role }`).
  Devolve a pivot final (`findMany` tipado).

## Erros

- `400` — params/body inválidos (ex.: `systemId` não numérico, `systems[].role` vazio) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404` — `SYSTEM_NOT_FOUND` / `USER_NOT_FOUND` (referências inexistentes) ou
  `LINK_NOT_FOUND` (unlink sem vínculo).
- `409 ALREADY_LINKED` — `POST` de um par user↔system já vinculado (UNIQUE composto, Prisma `P2002`).

## Gotchas

- **`role` é nullable:** `link` (POST) cria o vínculo sem `role` (fica `null`); só o `PUT`
  (`replaceUserSystems`) define `role`. Por isso `getUserSystemAccess` retorna `role: string | null`.
- **`PUT` substitui, não faz merge:** qualquer acesso ausente no array é removido. Mande a lista completa.
- **`created_by` no `link` é descartado** — está no Zod só pra não quebrar clientes que o enviam.
