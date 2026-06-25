# rule.md — módulo `bus`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD das **Business Units** (`bu`) da 3F. Cada BU tem identidade visual (cores, logo) e um `slug`
único, e participa de uma **hierarquia em árvore** via auto-relacionamento `parent_id` (uma BU
aponta para sua BU-pai; raízes têm `parent_id` nulo). O módulo **lista/filtra** (paginado),
**consulta** uma BU, expõe a **árvore completa** (`/bus/tree`), **cria**, **edita** (incluindo
mover de pai e soft-disable via `is_active`) e **exclui** (hard delete).

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/bus` | `bus:read` | Lista (filtro `is_active`; paginado) |
| GET | `/bus/tree` | `bus:read` | Árvore hierárquica completa (raízes + `children` aninhados) |
| GET | `/bus/:id` | `bus:read` | Uma BU |
| POST | `/bus` | `bus:write` | Cria BU |
| PATCH | `/bus/:id` | `bus:write` | Edita (nome, slug, cores, logo, `parent_id`, `is_active`...) |
| DELETE | `/bus/:id` | `bus:delete` | **Hard delete** |

> ⚠️ **Ordem das rotas:** `/bus/tree` é registrada **antes** de `/bus/:id`, senão o param `:id`
> captura `"tree"`. Mantenha essa ordem ao mexer no `routes.ts`.

## Schema (Zod) — `schema.ts`

- **params** (`buParamsSchema`): `id` — `z.coerce.number().int().positive()`.
- **list query** (`listBusQuerySchema`): estende `paginationQuerySchema` (`page`, `perPage`) só com
  `is_active` (`"true"`/`"false"` → boolean, opcional). **Sem `parent_id` nem busca textual como
  param** (convenção do `CLAUDE.md`) — viram rotas dedicadas. (`parent_id` continua existindo no
  **body** de create/update.)
- **create** (`createBuSchema`):
  - `name` (obrigatório, 1–100 chars, trim);
  - `slug` (obrigatório, 1–100 chars, regex `^[a-z0-9-]+$` — só minúsculas, números e hífens);
  - `description` (`.nullish()` — aceita `null`);
  - `primary_color_hex` / `secondary_color_hex` (`.nullish()`, regex `^#[0-9A-Fa-f]{6}$` — formato `#RRGGBB`);
  - `parent_id` (id positivo, `.nullish()` — `null` torna a BU raiz);
  - `logo_picture` (`.nullish()`);
  - `is_active` (boolean, opcional).
  - Campos nullable no banco usam `.nullish()` (cliente pode mandar `null`); ver convenção em `../rule.md`.
- **update** (`updateBuSchema`): `createBuSchema.partial()` — todos os campos opcionais.

## Regras de negócio

- **Hierarquia em árvore:** `parent_id` é auto-relacionamento. Na criação/edição, se `parent_id`
  vier **com valor** (`!= null`), a BU-pai é validada via `assertBuExists` (404 limpo se não existir).
  `parent_id: null` torna a BU uma raiz (não dispara validação).
- **Anti-ciclo (parcial):** no `update`, `parent_id === id` é rejeitado (`INVALID_PARENT`) — uma BU
  não pode ser pai dela mesma. (Não há checagem de ciclos mais profundos no código.)
- **`is_active` vs DELETE:** alinhado com a regra global — `PATCH { is_active: false }` é
  soft-disable; `DELETE` é hard delete (`prisma.bu.delete`).
- **Slug** é validado por formato no Zod; a garantia de unicidade vem da constraint do banco
  (violação → P2002 → 409, ver Erros).

## Service — `service.ts`

- `buildWhere(query)`: monta o `where` da listagem só a partir de `is_active` (demais filtros viraram
  rotas).
- `list`: `findMany` + `count` em paralelo, `orderBy: { name: 'asc' }`, paginação via `toSkipTake`.
- `tree`: carrega **todas** as BUs (`orderBy name asc`) e monta a árvore **em memória** — indexa
  por `id` num `Map`, anexa cada nó ao pai (`children`) e devolve as raízes (`parent_id` nulo).
  Tipo de retorno `BuTreeNode` (`bu` + `children: BuTreeNode[]`).
- `getById`: `findUnique`; se não achar, lança `NotFoundError` (`BU_NOT_FOUND`).
- `create`: se `parent_id` vier com valor (`!= null`), `assertBuExists`; monta
  `Prisma.buUncheckedCreateInput` com os campos do input e persiste (`prisma.bu.create`).
- `update`: se `parent_id` vier com valor (`!= null`), valida `!== id` (`INVALID_PARENT`) e
  `assertBuExists`; aplica o input com spread (`...input`) e `prisma.bu.update`.
- `remove`: hard delete (`prisma.bu.delete`).

## Erros

- `400` — body/query inválidos (ex.: `slug` fora do regex, cor fora de `#RRGGBB`, `name` ausente)
  → ZodError. Também `INVALID_PARENT` (`ValidationError`) quando `parent_id === id` no update.
- `403 INSUFFICIENT_SCOPE` — token não tem o scope da rota.
- `404 BU_NOT_FOUND` — `id` inexistente no `getById`, ou `parent_id` inexistente no create/update
  (`assertBuExists`).
- `409` — slug duplicado (constraint única → P2002) mapeado pelo `error-handler`.

## Gotchas

- Manter `/bus/tree` antes de `/bus/:id` no `routes.ts`.
- A árvore é montada **em memória** (carrega a tabela inteira); não há limite/paginação em `/bus/tree`.
- O anti-ciclo só cobre o caso direto (pai = a própria BU); ciclos indiretos (A→B→A) não são barrados
  no código.
