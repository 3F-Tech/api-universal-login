# rule.md — módulo `users`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD de **usuários** — o recurso central de identidade. Inclui a gestão do vínculo **N:N com BUs**
(tabela `users_bus`), que substituiu a antiga coluna `user.bu_id`. Toda resposta de usuário embute
o array `bus` (as BUs vinculadas, cada uma com `from_squad`).

## Endpoints

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/users` | `users:read` | Lista (filtros + busca textual; paginado) |
| GET | `/users/:id` | `users:read` | Um usuário (+ `bus`) |
| POST | `/users` | `users:write` | Cria usuário (+ vínculos de BU opcionais) |
| PATCH | `/users/:id` | `users:write` | Atualiza (campos parciais; pode substituir `bus`) |
| DELETE | `/users/:id` | `users:delete` | **Hard delete** (vínculos `users_bus` caem por CASCADE) |

## Schema (Zod) — `schema.ts`

- **create** (`createUserSchema`): obrigatórios `name`, `email` (lowercase), `password` (8–72),
  `role`. Opcionais: dados pessoais (cpf, cnpj, phone, instagram…), endereço, FKs (`department_id`,
  `position_id`, `band_id`, `squad_id`) e `bus` (array de vínculos).
- **update** (`updateUserSchema`): `createUserSchema.partial()` — tudo opcional.
- **bus link** (`busLinkSchema`): `{ bu_id, from_squad? = false }`. **`from_squad` vem do FRONT** —
  é o front que identifica a BU do squad e marca `true`; as demais ficam `false`. A API só persiste,
  **não** sincroniza com `squad.bu_id`.
- **list query**: `is_active`, `bu_id` (filtra via pivot), `squad_id`, `department_id`, `q` (busca
  por nome OU email), `page`, `perPage`.

## Regras de negócio

- **Vínculos de BU (`bus`):**
  - No **create**: presente grava os vínculos; ausente = nenhum.
  - No **update**: presente **substitui o conjunto inteiro** (deleta todos e recria); ausente = não mexe.
  - Sempre **deduplicados** por `bu_id` (último vence) via `normalizeBus`, pra não violar o
    `UNIQUE (user_id, bu_id)`.
  - Cada `bu_id` é validado antes (`assertBuExists`) → `404` limpo em vez de `P2003` cru.
- **Senha:** hasheada com bcrypt no create e, no update, só se `password` vier preenchido.
- **Escrita transacional:** create/update usam `prisma.$transaction` — usuário + vínculos numa só
  unidade.

## Service — `service.ts`

- `SAFE_OMIT = { password: true }` em toda leitura/escrita.
- `fetchUserBus(client, userId)` — BUs de UM usuário (cada uma com `from_squad`).
- `fetchBusByUser(userIds[])` — BUs de VÁRIOS numa query só, **evitando N+1** na listagem (retorna
  Map `user_id → BUs[]`).
- `list` embute `bus` em cada usuário via o Map acima; `getById`/`create`/`update` via `fetchUserBus`.
- `remove` = hard delete (vínculos somem por `ON DELETE CASCADE`).

## Erros

`USER_NOT_FOUND` (404). BU inexistente nos vínculos → `404` (via `assertBuExists`). Email/cpf/cnpj
duplicados → `409` (P2002, pelo error-handler).

## Gotchas

- Nunca retornar `password`.
- `from_squad` é responsabilidade do front — não inferir no backend.
- Em `update`, mandar `bus: []` **apaga** todos os vínculos; omitir `bus` os preserva. São coisas
  diferentes.
- Filtro `bu_id` na listagem usa `where.users_bus = { some: { bu_id } }` (relação), não coluna escalar.
