# rule.md — módulo `bands`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD de **bands** (faixas/níveis — modelo `band`) — tabela de referência organizacional usada para
compor o perfil dos usuários. Além dos campos básicos, carrega atributos de apresentação:
`color_hex` (cor para o front), `icon` e `sort_order` (ordem natural de exibição). Tem também
`is_active` e `created_by`. Módulo simples: lista/consulta/cria/edita/exclui.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/bands` | `bands:read` | Lista (filtros `is_active`, `q`; paginado, ordem natural) |
| GET | `/bands/:id` | `bands:read` | Uma band |
| POST | `/bands` | `bands:write` | Cria |
| PATCH | `/bands/:id` | `bands:write` | Edita `name`/`color_hex`/`icon`/`sort_order`/`is_active` |
| DELETE | `/bands/:id` | `bands:delete` | **Hard delete** |

## Schema (Zod) — `schema.ts`

- **params** (`bandParamsSchema`): `id` (`z.coerce.number().int().positive()`).
- **create** (`createBandSchema`):
  - `name` (trim, 1–100 chars, obrigatório).
  - `color_hex` (trim, regex `^#[0-9A-Fa-f]{6}$` — formato `#RRGGBB`, `.nullish()`). Mensagem custom:
    "Cor deve estar no formato #RRGGBB".
  - `icon` (trim, 1–100, `.nullish()`).
  - `sort_order` (`z.coerce.number().int().min(0)`, opcional).
  - `is_active` (boolean, opcional).
  - `created_by` (id positivo, opcional no Zod).
- **update** (`updateBandSchema`): `name`, `color_hex`, `icon`, `sort_order`, `is_active` — todos
  opcionais (mesmas validações do create; `color_hex`/`icon` `.nullish()`). **`created_by` não está
  no update** (definido só na criação).
- **Nullable aceita `null`:** `color_hex` e `icon` usam `.nullish()` (cliente pode mandar `null`).
  `created_by` segue `.optional()` (exigido pela regra de negócio, não aceita `null`). Ver `../rule.md`.
- **list query** (`listBandsQuerySchema`): estende `paginationQuerySchema` com `is_active`
  (`booleanQueryParam` → boolean) e `q` (trim, 1–100, busca por nome).

## Regras de negócio

- **`created_by` vem do body.** Schema marca como opcional, mas a decisão travada do projeto é que ele
  é obrigatório no create de `band` (coluna nullable no banco; quem exige é a regra de negócio).
  Quando informado, o service valida que o usuário existe antes de criar.
- **Ordem natural por `sort_order`.** A listagem ordena primeiro por `sort_order` asc, depois por
  `name` asc — bands têm sequência intencional (não é só alfabético).
- **DELETE = hard delete.** `is_active` é independente, mexido só via `PATCH { is_active }`
  (soft-disable, não soft-delete).

## Service — `service.ts`

- `buildWhere`: filtra por `is_active` quando definido e por `q` (`name contains`, `mode:
  'insensitive'`).
- `list`: `findMany` + `count` em paralelo; `orderBy: [{ sort_order: 'asc' }, { name: 'asc' }]`;
  paginação via `toSkipTake`.
- `getById`: `findUnique`; se não achar → `NotFoundError` com `code: 'BAND_NOT_FOUND'`.
- `create`: se `created_by` veio, valida com `assertUserExists(input.created_by,
  'CREATED_BY_NOT_FOUND')`; monta `bandUncheckedCreateInput` (`name`, `color_hex`, `icon`,
  `sort_order`, `is_active`, `created_by`) e persiste.
- `update`: espalha o input direto no `bandUncheckedUpdateInput` e chama `update`.
- `remove`: hard delete (`prisma.band.delete`).

## Erros

- `400` — body/query inválidos (ex.: `name` vazio, `color_hex` fora do formato `#RRGGBB`,
  `sort_order` negativo) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404` — `BAND_NOT_FOUND` (id inexistente no `getById`) ou `CREATED_BY_NOT_FOUND` (usuário do
  `created_by` não existe no create).

## Gotchas

- `color_hex` exige exatamente 6 hex dígitos com `#` na frente (`#RRGGBB`); shorthand `#RGB` ou cores
  sem `#` são rejeitados.
- `icon` (recentemente adicionado) tem mínimo de 1 char quando presente — diferente do `icon` de
  `departments`, que aceita string vazia após trim só no limite máximo. Não envie `icon: ""`.
- `update`/`remove` **não checam existência antes** de chamar o Prisma: um id inexistente cai no
  `P2025` do Prisma → o `error-handler` mapeia para `404`.
- `id` e `sort_order` usam `z.coerce`, então chegam como string e são convertidos para number.
