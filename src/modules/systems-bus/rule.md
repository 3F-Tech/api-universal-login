# rule.md — módulo `systems-bus`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

Gerencia o **vínculo N:N entre `system` e `bu`** (business unit) — a tabela-pivô `systems_bus`. Permite
listar as BUs de um sistema, vincular/desvincular uma BU, **substituir em bloco** o conjunto de BUs de
um sistema e consultar a visão inversa (sistemas de uma BU). Não administra `system` nem `bu` em si
(isso fica nos módulos `systems` e `bus`); aqui só se mexe na relação.

> ⚠️ A tabela `systems_bus` tem **PK composta (`system_id` + `bu_id`)** e **não tem coluna `id`
> própria**. Por isso um vínculo é sempre identificado pelo **par de ids**, nunca por um id único —
> e o delete usa `deleteMany`, não `delete` por id (ver Service / Gotchas).

## Endpoints

Todos exigem header `X-API-Key`. Rotas **aninhadas** sob `/systems/:systemId/bus` (e a visão inversa
sob `/bus/:buId/systems`). Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/systems/:systemId/bus` | `systems-bus:read` | Lista os `bu_id` vinculados ao sistema (lista completa, sem paginação) |
| PUT | `/systems/:systemId/bus` | `systems-bus:write` | **Substitui** o conjunto de BUs do sistema (body `bu_ids`) |
| POST | `/systems/:systemId/bus` | `systems-bus:write` | Vincula uma BU (body `bu_id`) — retorna `201` |
| DELETE | `/systems/:systemId/bus/:buId` | `systems-bus:delete` | Desvincula uma BU (par de ids na URL) |
| GET | `/bus/:buId/systems` | `systems-bus:read` | Visão inversa: sistemas vinculados à BU (paginado) |

## Schema (Zod) — `schema.ts`

- `id = z.coerce.number().int().positive()` — base reutilizada para todos os ids.
- **params**:
  - `systemIdParamSchema`: `{ systemId }`.
  - `buIdParamSchema`: `{ buId }`.
  - `systemBuParamsSchema`: `{ systemId, buId }` (usado no DELETE).
- **body**:
  - `linkBuBodySchema`: `{ bu_id }` (POST).
  - `replaceBusBodySchema`: `{ bu_ids: number[] }` (PUT) — array pode ser vazio (zera os vínculos).
- **list query** (apenas na visão inversa `/bus/:buId/systems`): `paginationQuerySchema` (`page`, `perPage`).

## Regras de negócio

- **Identificação por par de ids:** sem coluna `id`, todo vínculo é endereçado por (`system_id`, `bu_id`).
- **Vincular é idempotente-ish:** POST de uma BU já vinculada → `409 ALREADY_LINKED` (constraint P2002 da PK composta).
- **PUT é substituição total:** apaga todos os vínculos do sistema e recria a partir de `bu_ids`. Enviar
  `bu_ids: []` remove todos. Faz dedupe dos ids e valida a existência de cada BU **antes** de tocar no banco.
- **Validação de existência:** create/replace validam `system_id` e cada `bu_id` via `utils/references.ts`
  (`assertSystemExists`, `assertBuExists`) para erro 404 limpo antes da operação.
- **DELETE:** desvínculo real do par; se não havia vínculo → `404 LINK_NOT_FOUND`.

## Service — `service.ts`

- `getSystemBuIds(systemId)`: valida o sistema; retorna a **lista completa** de `{ bu_id }` (sem
  paginação, `orderBy bu_id asc`). É o que o GET `/systems/:systemId/bus` usa (via `listBuIds`).
- `linkBu(systemId, buId)`: valida sistema e BU; `prisma.systems_bus.create`. Captura `P2002` → `ConflictError ALREADY_LINKED`.
- `unlinkBu(systemId, buId)`: `prisma.systems_bus.deleteMany({ where: { system_id, bu_id } })`. Se
  `count === 0` → `NotFoundError LINK_NOT_FOUND`. Retorna `{ system_id, bu_id, deleted: true }`.
  Usa `deleteMany` (e não `delete`) **justamente porque a tabela não tem `id`** para um `where` único.
- `replaceSystemBus(systemId, buIds)`: valida sistema + dedup (`new Set`) + valida cada BU; em
  `prisma.$transaction`: `deleteMany` de tudo do sistema, `createMany` dos ids (se houver), e
  retorna a lista final de `{ bu_id }` ordenada.
- `listBuSystems(buId, query)`: visão inversa, **paginada**. Valida a BU; filtra `system` por
  `{ systems_bus: { some: { bu_id } } }`; retorna `{ data, total }`.
- `listSystemBus(systemId, query)`: variante **paginada** que lista as `bu` de um sistema via filtro
  de relação. Existe no service mas **não é usada pelo controller atual** (o GET usa `getSystemBuIds`).

> Filtros usam relação por `where` (`{ systems_bus: { some: { ... } } }`) em vez de `include` com nomes
> de relação frágeis, conforme convenção do `CLAUDE.md`.

## Erros

- `400` — params/body inválidos (ex.: `systemId`/`buId` não numérico, `bu_ids` não-array) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404` — `SYSTEM_NOT_FOUND` / `BU_NOT_FOUND` (refs inexistentes em create/replace/lists) ou
  `LINK_NOT_FOUND` (DELETE de vínculo inexistente).
- `409 ALREADY_LINKED` — POST de BU já vinculada (P2002 na PK composta).

## Gotchas

- **PK composta, sem `id`:** nunca tente `delete`/`update` por id único. Use `deleteMany`/`createMany`
  com `where` por par de ids. Qualquer refactor que assuma uma coluna `id` quebra.
- **GET lista só `bu_id`:** o endpoint `/systems/:systemId/bus` devolve `{ bu_id }[]` cru (do pivô), não
  objetos `bu` completos. Para os dados completos da BU existiria `listSystemBus` (hoje não roteado).
- **PUT vazio zera:** `bu_ids: []` no PUT remove todos os vínculos do sistema — comportamento esperado
  da substituição total.
- **Assimetria de paginação:** a visão inversa (`/bus/:buId/systems`) é paginada; o GET direto não é.
- **Service modificado recentemente** — confira `getSystemBuIds`/`replaceSystemBus` ao mexer aqui.
