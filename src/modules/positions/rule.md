# rule.md — módulo `positions`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD de **cargos** (modelo `position`) — tabela de referência organizacional usada para compor o
perfil dos usuários. Cada cargo tem `name`, flag `is_active` e `created_by` (autor da criação).
Módulo simples: lista/consulta/cria/edita/exclui.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/positions` | `positions:read` | Lista (filtros `is_active`, `q`; paginado) |
| GET | `/positions/:id` | `positions:read` | Um cargo |
| POST | `/positions` | `positions:write` | Cria |
| PATCH | `/positions/:id` | `positions:write` | Edita `name`/`is_active` |
| DELETE | `/positions/:id` | `positions:delete` | **Hard delete** |

## Schema (Zod) — `schema.ts`

- **params** (`positionParamsSchema`): `id` (`z.coerce.number().int().positive()`).
- **create** (`createPositionSchema`): `name` (trim, 1–100 chars, obrigatório), `is_active` (boolean,
  opcional), `created_by` (id positivo, opcional no Zod).
- **update** (`updatePositionSchema`): `name`, `is_active` — ambos opcionais. **`created_by` não está
  no update** (definido só na criação).
- **list query** (`listPositionsQuerySchema`): estende `paginationQuerySchema` com `is_active`
  (`booleanQueryParam` → boolean) e `q` (trim, 1–100, busca por nome).

## Regras de negócio

- **`created_by` vem do body.** Schema marca como opcional, mas a decisão travada do projeto é que ele
  é obrigatório no create de `position` (coluna nullable no banco; quem exige é a regra de negócio).
  Quando informado, o service valida que o usuário existe antes de criar.
- **DELETE = hard delete.** `is_active` é independente, mexido só via `PATCH { is_active }`
  (soft-disable, não soft-delete).

## Service — `service.ts`

- `buildWhere`: filtra por `is_active` quando definido e por `q` (`name contains`, `mode:
  'insensitive'`).
- `list`: `findMany` + `count` em paralelo; `orderBy: { name: 'asc' }`; paginação via `toSkipTake`.
- `getById`: `findUnique`; se não achar → `NotFoundError` com `code: 'POSITION_NOT_FOUND'`.
- `create`: se `created_by` veio, valida com `assertUserExists(input.created_by,
  'CREATED_BY_NOT_FOUND')`; monta `positionUncheckedCreateInput` (`name`, `is_active`, `created_by`)
  e persiste.
- `update`: espalha o input direto no `positionUncheckedUpdateInput` e chama `update`.
- `remove`: hard delete (`prisma.position.delete`).

## Erros

- `400` — body/query inválidos (ex.: `name` vazio ou > 100 chars) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404` — `POSITION_NOT_FOUND` (id inexistente no `getById`) ou `CREATED_BY_NOT_FOUND` (usuário do
  `created_by` não existe no create).

## Gotchas

- **Tabela `position` é palavra reservada em SQL.** O modelo Prisma é `prisma.position` (singular,
  introspectado da tabela `position`). Cuidado ao escrever SQL cru contra essa tabela.
- `update`/`remove` **não checam existência antes** de chamar o Prisma: um id inexistente cai no
  `P2025` do Prisma → o `error-handler` mapeia para `404`.
- `id` usa `z.coerce`, então params/ids chegam como string e são convertidos para number.
