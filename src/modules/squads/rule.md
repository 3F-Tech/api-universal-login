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
| GET | `/squads` | `squads:read` | Lista (filtros `is_active`, `bu_id`, `leader_id`, `q`; paginado) |
| GET | `/squads/:id` | `squads:read` | Um squad |
| GET | `/squads/:id/users` | `users:read` | Usuários do squad (paginado, com `bus` embutidas) |
| POST | `/squads` | `squads:write` | Cria squad (`leader_id` obrigatório) |
| PATCH | `/squads/:id` | `squads:write` | Edita nome/descrição/picture/leader_id/bu_id/is_active |
| DELETE | `/squads/:id` | `squads:delete` | **Hard delete** |

> ⚠️ **`/squads/:id/users` usa scope `users:read`**, não `squads:read` — devolve dados de usuário
> (PII + BUs), então a autorização acompanha o recurso retornado.

## Schema (Zod) — `schema.ts`

- **create** (`createSquadSchema`): `name` (1–150 chars, obrigatório), `leader_id` (id positivo,
  **obrigatório** — mesma lógica do `created_by`), `description` (opcional), `picture` (opcional),
  `bu_id` (id positivo, opcional), `is_active` (boolean, opcional).
- **update** (`updateSquadSchema`): todos opcionais — `name`, `description`, `picture`, `leader_id`,
  `bu_id`, `is_active`.
- **list query** (`listSquadsQuerySchema`): estende `paginationQuerySchema` (`page`, `perPage`) com
  `is_active` (`"true"`/`"false"` → boolean via `booleanQueryParam`), `bu_id`, `leader_id` e `q`
  (busca textual, 1–150 chars).
- **params** (`squadParamsSchema`): `id` (`z.coerce.number().int().positive()`).

## Regras de negócio

- **`leader_id` obrigatório no create** (decisão travada): a coluna é nullable no banco, mas o Zod
  exige. Antes de persistir, valida que o user existe (`assertUserExists` → 404 `LEADER_NOT_FOUND`).
- **`bu_id` opcional**: quando informado (no create ou no update), valida que a BU existe
  (`assertBuExists` → 404 `BU_NOT_FOUND`).
- **No update**, `leader_id` e `bu_id` só são validados quando vêm no body (`!== undefined`).
- **`is_active` vs DELETE:** `PATCH { is_active: false }` faz soft-disable (religável); `DELETE`
  remove de vez. Alinhado com a regra global (DELETE = hard delete; `is_active` = soft-disable).
- **Listagem** ordenada por `name` asc; filtro `q` faz `contains` case-insensitive sobre `name`.

## Service — `service.ts`

- `buildWhere(query)`: monta o `where` a partir de `is_active`, `bu_id`, `leader_id` e `q`
  (`name: { contains, mode: 'insensitive' }`).
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
- Filtros (`is_active`, `bu_id`, `leader_id`, `q`) são só de `where`/escalares — segue a convenção do
  projeto de evitar `include` com nomes de relação frágeis.
- `leader_id` é obrigatório no Zod mas nullable no banco; não relaxe o schema sem pedir (decisão
  travada).
- A existência de `leader_id`/`bu_id` é validada **antes** do Prisma para devolver 404 limpo em vez de
  vazar erro de FK.
