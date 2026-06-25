# rule.md — módulo `departments`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD de **departamentos** (`department`) — uma das tabelas de referência organizacional usadas para
compor o perfil dos usuários. Cada departamento tem `name`, um `icon` opcional, flag `is_active` e
`created_by` (autor da criação). Módulo simples: lista/consulta/cria/edita/exclui.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/departments` | `departments:read` | Lista (filtro `is_active`; paginado) |
| GET | `/departments/:id` | `departments:read` | Um departamento |
| POST | `/departments` | `departments:write` | Cria |
| PATCH | `/departments/:id` | `departments:write` | Edita `name`/`icon`/`is_active` |
| DELETE | `/departments/:id` | `departments:delete` | **Hard delete** |

## Schema (Zod) — `schema.ts`

- **params** (`departmentParamsSchema`): `id` (`z.coerce.number().int().positive()`).
- **create** (`createDepartmentSchema`): `name` (trim, 1–100 chars, obrigatório), `icon` (trim,
  máx 100, `.nullish()` — aceita `null`), `is_active` (boolean, opcional), `created_by` (id positivo,
  opcional no Zod; **não** aceita `null`).
- **update** (`updateDepartmentSchema`): `name`, `icon` (`.nullish()`), `is_active` — todos opcionais.
  **`created_by` não é alterável via update** (definido só na criação; ver comentário no schema).
- **list query** (`listDepartmentsQuerySchema`): estende `paginationQuerySchema` só com `is_active`
  (`booleanQueryParam` → boolean). Busca por nome não é param (convenção do `CLAUDE.md`) — vira rota.

## Regras de negócio

- **`created_by` vem do body.** Schema marca como opcional, mas a decisão travada do projeto é que ele
  é obrigatório no create de `department` (coluna nullable no banco; quem exige é a regra de negócio).
  Quando informado, o service valida que o usuário existe antes de criar.
- **DELETE = hard delete.** `is_active` é independente, mexido só via `PATCH { is_active }`
  (soft-disable, não soft-delete).

## Service — `service.ts`

- `buildWhere`: filtra só por `is_active` quando definido.
- `list`: `findMany` + `count` em paralelo; `orderBy: { name: 'asc' }`; paginação via `toSkipTake`.
- `getById`: `findUnique`; se não achar → `NotFoundError` com `code: 'DEPARTMENT_NOT_FOUND'`.
- `create`: se `created_by` veio, valida com `assertUserExists(input.created_by,
  'CREATED_BY_NOT_FOUND')`; monta `departmentUncheckedCreateInput` (`name`, `icon`, `is_active`,
  `created_by`) e persiste.
- `update`: espalha o input direto no `departmentUncheckedUpdateInput` e chama `update`.
- `remove`: hard delete (`prisma.department.delete`).

## Erros

- `400` — body/query inválidos (ex.: `name` vazio ou > 100 chars) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404` — `DEPARTMENT_NOT_FOUND` (id inexistente no `getById`) ou `CREATED_BY_NOT_FOUND` (usuário do
  `created_by` não existe no create).

## Gotchas

- `update`/`remove` **não checam existência antes** de chamar o Prisma: um id inexistente cai no
  `P2025` do Prisma → o `error-handler` mapeia para `404`.
- `icon` é só uma string livre (máx 100); não há validação de formato.
- `id` usa `z.coerce`, então params/ids chegam como string e são convertidos para number.
