# rule.md — módulo `squads`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD dos **squads** (times) da organização. Cada squad tem um **líder** (`leader_id`, FK → `user`,
obrigatório no create) e pode estar vinculado a uma **BU** (`bu_id`, FK → `bu`, opcional). Além do
CRUD, o módulo expõe uma rota auxiliar que **lista os usuários de um squad** (via `user.squad_id`),
delegando para o módulo `users`.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/squads` | `squads:read` | Lista (filtro `is_active`; paginado) |
| GET | `/squads/:id` | `squads:read` | Um squad |
| GET | `/squads/:id/users` | `users:read` | Usuários do squad (paginado, com `bus` embutidas) — `user` completo |
| GET | `/squads/:id/members` | `users:read` | Membros em DTO **enxuto e resolvido** (nomes, não ids) p/ o card de squad |
| POST | `/squads` | `squads:write` | Cria squad (`leader_id` obrigatório) |
| PATCH | `/squads/:id` | `squads:write` | Edita nome/descrição/picture/leader_id/bu_id/is_active |
| DELETE | `/squads/:id` | `squads:delete` | **Hard delete** |

> ⚠️ **`/squads/:id/users` usa scope `users:read`**, não `squads:read` — devolve dados de usuário
> (PII + BUs), então a autorização acompanha o recurso retornado.

## Schema (Zod) — `schema.ts`

- **create** (`createSquadSchema`): `name` (1–150 chars, obrigatório), `leader_id` (id positivo,
  **obrigatório** — mesma lógica do `created_by`), `description` (`.nullish()` — aceita string, `null`
  ou ausência), `picture` (`.nullish()`), `bu_id` (id positivo, `.nullish()`), `is_active` (boolean,
  opcional).
- **update** (`updateSquadSchema`): todos opcionais — `name`, `leader_id` e `is_active`; já
  `description`, `picture` e `bu_id` são `.nullish()` (aceitam `null` para limpar o campo).
- **Campos nullable no banco aceitam `null`** (decisão travada): o front pode mandar `null` em vez de
  omitir o campo. `description`, `picture` e `bu_id` usam `.nullish()` (= `.nullable().optional()`).
  `null` grava `null` na coluna (limpa o vínculo/valor).
- **list query** (`listSquadsQuerySchema`): estende `paginationQuerySchema` (`page`, `perPage`) só com
  `is_active` (`"true"`/`"false"` → boolean via `booleanQueryParam`). **Sem filtros extras como param**
  (convenção do `CLAUDE.md`): `bu_id`/`leader_id`/busca textual viram rotas dedicadas.
- **params** (`squadParamsSchema`): `id` (`z.coerce.number().int().positive()`).

## Membros do squad (`/members`)

Define **membro** assim (decisão travada):

> **`membros(squad) = { user.squad_id == squad.id, is_active = true } ∪ { líder }`**

- **Só ativos** entram pelo `squad_id`; o **líder entra sempre** (mesmo inativo ou com `squad_id`
  divergente), e é contado **uma vez só** (não duplica quando já é membro ativo).
- Na prática o líder sempre tem `squad_id` apontando pro próprio squad (regra do front), então a
  "União" não muda os números — é só robustez contra anomalia de dado.

> **Contagem (`member_count`) — ESTACIONADA.** As funções `memberCountBySquad` /
> `listWithMemberCount` / `getByIdWithMemberCount` existem no service mas **sem chamador**: o param
> `?include=member_count` foi removido pela convenção de params. Religar quando a contagem virar uma
> **rota dedicada** (ex.: `GET /squads/member-counts`). Usam a mesma definição de membro acima.

### `GET /squads/:id/members`
- **Rota nova dedicada** (mantém `/squads/:id/users` intacto). Scope **`users:read`** (devolve PII).
  `404 SQUAD_NOT_FOUND` se não existir. Paginado, envelope `{ data, meta }`.
- DTO enxuto por membro: `id`, `name`, `email`, `profile_picture`, `position {id,name}`,
  `band {id,name,color_hex,icon}`, `department {id,name,icon}`, `bus [{id,name,slug,primary_color_hex,from_squad}]`,
  `is_leader`. `position`/`band`/`department` podem ser `null` (FK nullable); `bus` é sempre array.
- **Líder no topo** da página (`is_leader: true`) — ordenação `name` asc + flutua o líder pro topo
  (ordenação estável). Caso real ≤14 membros = página única.
- **Custo fixo:** 1 query de membros + 1 `count` + 1 por tabela de referência
  (`position`/`band`/`department` via `id in […]`) + 1 de `users_bus`. Sem `include` de relação frágil.

## Regras de negócio

- **`leader_id` obrigatório no create** (decisão travada): a coluna é nullable no banco, mas o Zod
  exige. Antes de persistir, valida que o user existe (`assertUserExists` → 404 `LEADER_NOT_FOUND`).
- **`bu_id` opcional/nullable**: quando informado com valor (no create ou no update), valida que a BU
  existe (`assertBuExists` → 404 `BU_NOT_FOUND`). `bu_id: null` limpa o vínculo (vira squad sem BU) e
  **não** dispara validação.
- **No update**, `leader_id` só é validado quando vem no body (`!== undefined`); `bu_id` só é
  validado quando vem com valor (`!= null` — assim `null` passa direto para limpar o vínculo).
- **`is_active` vs DELETE:** `PATCH { is_active: false }` faz soft-disable (religável); `DELETE`
  remove de vez. Alinhado com a regra global (DELETE = hard delete; `is_active` = soft-disable).
- **Listagem** ordenada por `name` asc. Único filtro de query é `is_active` (convenção de params).

## Service — `service.ts`

- `buildWhere(query)`: monta o `where` só a partir de `is_active` (demais filtros viraram rotas).
- `list`: `findMany` + `count` em paralelo, `orderBy: { name: 'asc' }`, paginado via `toSkipTake`.
- `getById`: `findUnique`; se não achar, `NotFoundError` com code `SQUAD_NOT_FOUND`.
- `listUsers(squadId, query)`: valida o squad (`assertSquadExists` → 404 limpo) e **delega** para
  `usersService.list({ ...query, squad_id: squadId })` — já vem paginado e com as BUs (`bus`)
  embutidas.
- `create`: valida `leader_id` (sempre) e `bu_id` (se vier); monta `Prisma.squadUncheckedCreateInput`
  com campos escalares (`leader_id`, `bu_id` explícitos) e persiste.
- `update`: valida `leader_id`/`bu_id` quando presentes; aplica `...input` como
  `Prisma.squadUncheckedUpdateInput`.
- `remove`: hard delete (`prisma.squad.delete`).

## Erros

- `400` — body/query inválidos (ex.: `name` vazio, `leader_id` ausente no create) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token não tem o scope da rota.
- `404` — `SQUAD_NOT_FOUND` (id inexistente em `getById`/`listUsers`), `LEADER_NOT_FOUND`
  (`leader_id` inexistente no create/update), `BU_NOT_FOUND` (`bu_id` inexistente no create/update).
- `409` — `DELETE` de squad referenciado (FK `user.squad_id`) → Prisma `P2003` mapeado pelo
  `error-handler`.

## Gotchas

- `/squads/:id/users` exige `users:read`, não `squads:read` — não confunda ao mexer no `routes.ts`.
- O único filtro de query é `is_active` (convenção de params do `CLAUDE.md`); `bu_id`/`leader_id`/busca
  não são mais params — quando precisarem, viram rotas dedicadas.
- `leader_id` é obrigatório no Zod mas nullable no banco; não relaxe o schema sem pedir (decisão
  travada).
- A existência de `leader_id`/`bu_id` é validada **antes** do Prisma para devolver 404 limpo em vez de
  vazar erro de FK.
