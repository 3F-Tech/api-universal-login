# rule.md — módulo `positions`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD de **cargos** (modelo `position`) — tabela de referência organizacional usada para compor o
perfil dos usuários. Cada cargo tem `name`, flag `is_active`, `created_by` (autor da criação) e,
desde 2026-09-03, `department_id` (departamento dono do cargo — ex.: "Closer" → Comercial). Módulo
simples: lista/consulta/cria/edita/exclui.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/positions` | `positions:read` | Lista (filtro `is_active`; paginado) |
| GET | `/positions/:id` | `positions:read` | Um cargo |
| POST | `/positions` | `positions:write` | Cria |
| PATCH | `/positions/:id` | `positions:write` | Edita `name`/`is_active`/`department_id` |
| DELETE | `/positions/:id` | `positions:delete` | **Hard delete** |

Ver também `GET /departments/:id/positions` (cargos de um departamento) em
`src/modules/departments/rule.md`.

## Schema (Zod) — `schema.ts`

- **params** (`positionParamsSchema`): `id` (`z.coerce.number().int().positive()`).
- **create** (`createPositionSchema`): `name` (trim, 1–100 chars, obrigatório), `is_active` (boolean,
  opcional), `created_by` (id positivo, opcional no Zod), `department_id` (id positivo, `.nullish()`
  — coluna nullable, cliente pode mandar `null`).
- **update** (`updatePositionSchema`): `name`, `is_active`, `department_id` — todos opcionais.
  **`created_by` não está no update** (definido só na criação).
- **list query** (`listPositionsQuerySchema`): estende `paginationQuerySchema` só com `is_active`
  (`booleanQueryParam` → boolean). Busca por nome e filtro por departamento não são params
  (convenção do `CLAUDE.md`) — o segundo vira a rota `GET /departments/:id/positions`.

## Regras de negócio

- **`created_by` vem do body.** Schema marca como opcional, mas a decisão travada do projeto é que ele
  é obrigatório no create de `position` (coluna nullable no banco; quem exige é a regra de negócio).
  Quando informado, o service valida que o usuário existe antes de criar.
- **`department_id` é opcional e nullable** (diferente de `created_by`): pode ficar sem departamento.
  Quando informado (create ou update), o service valida com `assertDepartmentExists` antes de gravar
  (404 `DEPARTMENT_NOT_FOUND` limpo em vez de `P2003`). Guard usa `!= null` (aceita `0`? não — `id` é
  `positive()`), não `!== undefined`, seguindo a convenção de FK nullable do `CLAUDE.md`.
- **DELETE = hard delete.** `is_active` é independente, mexido só via `PATCH { is_active }`
  (soft-disable, não soft-delete).

## Service — `service.ts`

- `PositionListFilters` (tipo interno) estende `ListPositionsQuery` com `department_id?: number` —
  não é exposto na query pública; existe só para a rota `GET /departments/:id/positions` delegar.
- `buildWhere`: filtra por `is_active` e (internamente) `department_id`, quando definidos.
- `list`: `findMany` + `count` em paralelo; `orderBy: { name: 'asc' }`; paginação via `toSkipTake`.
- `listByDepartment(departmentId, query)`: valida o departamento (`assertDepartmentExists`) e delega
  para `list({ ...query, department_id: departmentId })`. Usado por
  `GET /departments/:id/positions` (controller mora em `departments/controller.ts`).
- `getById`: `findUnique`; se não achar → `NotFoundError` com `code: 'POSITION_NOT_FOUND'`.
- `create`: se `created_by` veio, valida com `assertUserExists(input.created_by,
  'CREATED_BY_NOT_FOUND')`; se `department_id` veio (não-null), valida com `assertDepartmentExists`;
  monta `positionUncheckedCreateInput` (`name`, `is_active`, `created_by`, `department_id`) e persiste.
- `update`: mesma validação de `department_id` antes; espalha o input direto no
  `positionUncheckedUpdateInput` e chama `update`.
- `remove`: hard delete (`prisma.position.delete`).

## Erros

- `400` — body/query inválidos (ex.: `name` vazio ou > 100 chars) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404` — `POSITION_NOT_FOUND` (id inexistente no `getById`), `CREATED_BY_NOT_FOUND` (usuário do
  `created_by` não existe no create) ou `DEPARTMENT_NOT_FOUND` (`department_id` informado não existe,
  no create/update ou no `:id` de `GET /departments/:id/positions`).

## Gotchas

- **Tabela `position` é palavra reservada em SQL.** O modelo Prisma é `prisma.position` (singular,
  introspectado da tabela `position`). Cuidado ao escrever SQL cru contra essa tabela.
- `update`/`remove` **não checam existência antes** de chamar o Prisma: um id inexistente cai no
  `P2025` do Prisma → o `error-handler` mapeia para `404`.
- `id` usa `z.coerce`, então params/ids chegam como string e são convertidos para number.
- `department_id` foi introspectado do banco (não é hand-write de model) — coluna nova adicionada
  via edição direta do `prisma/schema.prisma` + `prisma db push` pelo usuário (fluxo documentado na
  memória do projeto: DDL não pode ser feito pelo app, role `3f_core_app` não é dono das tabelas).
  Índice `idx_position_department_id` acompanha, mesmo padrão de toda FK do schema.
