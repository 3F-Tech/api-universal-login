# rule.md — módulo `systems`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

Catálogo dos **sistemas internos consumidores** da 3F Venture (`id`, `name`, `description`, `link`,
`logo_picture`, `is_active`). Um `system` é o "dono" das **API Keys** e dos vínculos
**`systems_users`** (quais usuários têm acesso a ele) e **`systems_bus`** (a quais BUs ele pertence).

Este módulo faz o CRUD do registro do sistema e, opcionalmente, embute as **BUs** de cada sistema na
listagem (`?include=bus`) para o front evitar N+1. Não administra as keys nem os vínculos de
usuário — isso fica nos módulos `api-keys`, `systems-users` e `systems-bus`.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/systems` | `systems:read` | Lista (filtros `is_active`, `q`; `?include=bus` embute as BUs; paginado) |
| GET | `/systems/:id` | `systems:read` | Um sistema |
| POST | `/systems` | `systems:write` | Cria sistema |
| PATCH | `/systems/:id` | `systems:write` | Edita nome/description/link/logo_picture/is_active |
| DELETE | `/systems/:id` | `systems:delete` | **Hard delete** |

## Schema (Zod) — `schema.ts`

- **params** (`systemParamsSchema`): `id` (`z.coerce.number().int().positive()`).
- **list query** (`listSystemsQuerySchema`): herda `paginationQuerySchema` (`page`, `perPage`) +
  `is_active` (`booleanQueryParam`, `"true"`/`"false"` → boolean), `q` (busca por nome, 1–150 chars)
  e `include` (enum só com `'bus'`).
- **create** (`createSystemSchema`): `name` (1–150 chars, obrigatório), `description` (`.nullish()`),
  `link` (URL válida, máx 500, `.nullish()`), `logo_picture` (`.nullish()`), `is_active` (boolean
  opcional). Campos nullable no banco aceitam `null` (ver `../rule.md`).
- **update** (`updateSystemSchema`): `createSystemSchema.partial()` — todos os campos opcionais.

## Regras de negócio

- **CRUD direto:** create monta `Prisma.systemUncheckedCreateInput` só com os campos escalares do
  body; não há `created_by` neste módulo (diferente de `department`/`position`/`band`/`api_key`).
- **`is_active` vs DELETE:** `PATCH { is_active: false }` desabilita sem apagar; `DELETE` é
  **hard delete** (`prisma.system.delete`). Alinhado com a regra global.
- **Busca por nome:** filtro `q` usa `contains` com `mode: 'insensitive'`.
- **Ordenação:** sempre `orderBy: { name: 'asc' }` na listagem (com ou sem `include=bus`); BUs
  embutidas também ordenadas por nome (`localeCompare`).

## Service — `service.ts`

- **`buildWhere(query)`**: monta `Prisma.systemWhereInput` a partir de `is_active` e `q`. Reutilizado
  por `list` e `listWithBus`.
- **`list(query)`**: `findMany` + `count` em paralelo; retorna `{ data, total }`.
- **`listWithBus(query)`**: variante de `list` que embute o campo **`bus`** em cada sistema com um
  número **fixo** de queries (não cresce com a quantidade de sistemas): 1 para os sistemas da página,
  1 `count` e 1 para os vínculos+BUs. Substitui o N+1 em que o front chamava `GET /systems/:id/bus`
  por sistema. Lê os vínculos via `prisma.systems_bus.findMany` filtrando
  `{ system_id: { in: systemIds } }` e fazendo `select: { system_id: true, bu: true }` — usa a
  relação FK direta `bu` (nome limpo, não as relações desambiguadas frágeis). Agrupa as BUs por
  sistema em memória (`Map<number, LinkedBu[]>`), ordena por nome e retorna
  `{ ...system, bus: [...] }`. Sistemas sem BU recebem `bus: []`.
  - Acionado pelo controller quando `query.include === 'bus'`.
- **`getById(id)`**: `findUnique`; lança `NotFoundError` (`SYSTEM_NOT_FOUND`) se não achar.
- **`create(input)`**: `prisma.system.create` com `Prisma.systemUncheckedCreateInput`.
- **`update(id, input)`**: `prisma.system.update` com `...input` (`Prisma.systemUncheckedUpdateInput`).
- **`remove(id)`**: hard delete (`prisma.system.delete`), retorno `void`.

## Erros

- `400` — body/query inválidos (ex.: `name` ausente, `link` não-URL, `include` fora de `bus`) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404 SYSTEM_NOT_FOUND` — `getById` com id inexistente.
- Erros conhecidos do Prisma mapeados pelo `error-handler` (ex.: `P2003`→409 ao deletar sistema
  ainda referenciado por keys/vínculos; `P2025`→404 em update/delete de id inexistente).

## Gotchas

- No `select` de `systems_bus`, use a relação FK direta **`bu`**; evite as relações desambiguadas
  (`buTobu` etc.), conforme a convenção do projeto.
- `controller.list` escolhe `listWithBus` vs `list` pelo `query.include`; ambos devolvem o mesmo
  envelope `{ data, total }` para `sendList`/`buildMeta`.
- DELETE é hard delete; para desabilitar sem apagar use `PATCH { is_active: false }`.
