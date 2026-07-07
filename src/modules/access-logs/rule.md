# rule.md — módulo `access-logs`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

Leitura (**read-only**) dos logs de tentativa de acesso/validação, persistidos na tabela
`systems_users_access`. Cada registro representa uma validação de credenciais (sucesso ou falha)
de um vínculo `systems_users` (par usuário↔sistema). Este módulo **só lista/consulta** — quem
**grava** os logs é o módulo `auth` (em `/auth/validate`). Não há create/update/delete aqui.

## Endpoints

Todos exigem header `X-API-Key` e o mesmo scope (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/systems/:systemId/access-logs` | `access-logs:read` | Logs de um sistema, todos os usuários (paginado) |
| GET | `/users/:userId/access-logs` | `access-logs:read` | Logs de um usuário, todos os sistemas (paginado) |
| GET | `/systems/:systemId/users/:userId/access-logs` | `access-logs:read` | Logs de **um usuário em um sistema** (paginado) |
| GET | `/access-logs/stats` | `access-logs:read` | **Agregado por dia** (sucesso/falha) pro gráfico de barras empilhadas — ver seção própria abaixo |
| GET | `/access-logs/wrong-password` | `access-logs:read` | **Usuários que erraram a senha** no range, agregados por usuário — ver seção própria abaixo |
| GET | `/access-logs/today` | `access-logs:read` | **Lista individual** dos acessos de **hoje** (todos os sistemas); filtro opcional `bu_id` — ver seção própria abaixo |

> Só existe o scope `access-logs:read` (`SCOPES.accessLogsRead`). Não há write nem delete — logs
> são imutáveis pela API.

## Schema (Zod) — `schema.ts`

- **params:** `systemIdParamSchema` (`systemId`) e `userIdParamSchema` (`userId`) — ambos
  `z.coerce.number().int().positive()`.
- **system query** (`systemAccessLogsQuerySchema`) e **user query** (`userAccessLogsQuerySchema`):
  ambas são só `paginationQuerySchema`. **Sem filtros como param** (convenção do `CLAUDE.md`): os
  antigos `success`/`from`/`to`/`user_id`/`system_id` viram rotas dedicadas quando forem necessários.
  Como `access-logs` não tem coluna `is_active`, aqui sobra só paginação.
- Tipos exportados: `SystemAccessLogsQuery`, `UserAccessLogsQuery`.

## Regras de negócio

- Antes de consultar, valida a existência do recurso-âncora: `assertSystemExists(systemId)` /
  `assertUserExists(userId)` (`utils/references.ts`) → 404 limpo se não existir.
- Filtro por relação: o `where` filtra via `systems_users` (`{ systems_users: { system_id } }` /
  `{ user_id } }`), seguindo a convenção do projeto (filtrar por relação, não usar `include` de
  nomes frágeis para filtrar).
- Ordenação fixa: `accessed_at: 'desc'` (mais recentes primeiro).

## Service — `service.ts`

- `listSystemAccessLogs(systemId, query)`, `listUserAccessLogs(userId, query)` e
  `listUserSystemAccessLogs(systemId, userId, query)`: montam o `where` (filtro por relação
  `systems_users`), rodam `findMany` + `count` em paralelo (`Promise.all`) e retornam `{ data, total }`.
  O último cruza `system_id` + `user_id` (o UNIQUE `(system_id, user_id)` garante 1 vínculo) e valida
  ambos (`assertSystemExists` + `assertUserExists`).
- `INCLUDE` traz apenas `systems_users: { select: { user_id, system_id } }` — só os ids do vínculo,
  para enriquecer cada row sem carregar relações inteiras. O tipo do row é `AccessLogRow`
  (`Prisma.systems_users_accessGetPayload<...>`).
- **`serialize(row)`**: projeta o shape de saída — `id` (string), `systems_users_id`, `user_id`,
  `system_id`, `success`, `wrong_password`, `accessed_at`. É aqui que o `BigInt` é convertido (ver
  Gotchas). `wrong_password` (`boolean | null`): `true` = tentativa com senha errada de usuário
  válido; `null` em registros anteriores à criação da coluna.
- Paginação via `toSkipTake(query)`; o controller monta o meta com `buildMeta(total, query)` e
  responde com `sendList`.

## Erros

- `400` — params/query inválidos (`systemId`/`userId` não positivos, datas inválidas) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem `access-logs:read`.
- `404` — `SYSTEM_NOT_FOUND` / `USER_NOT_FOUND` (âncora inexistente, via `assertSystemExists` /
  `assertUserExists`).

## Gotchas

- **`systems_users_access.id` é `BigInt`.** O `serialize` faz `row.id.toString()` — **obrigatório**,
  senão o `JSON.stringify` da resposta quebra (`TypeError: Do not know how to serialize a BigInt`).
  Qualquer campo BigInt novo precisa do mesmo tratamento.
- Read-only por design: não adicione rotas de escrita aqui — a gravação dos logs é responsabilidade
  exclusiva do módulo `auth` (`/auth/validate`).
- `user_id`/`system_id` na saída vêm do vínculo `systems_users` (via `INCLUDE`), não de colunas
  diretas de `systems_users_access`.

## `GET /access-logs/stats` (agregado por dia)

Alimenta um gráfico de barras empilhadas (sucesso x falha) por dia. Única rota do módulo que
**não** é aninhada em `:systemId`/`:userId` — agrega por padrão **todos** os sistemas.

### Query (`accessLogStatsQuerySchema`)

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `days` | int (1–`MAX_STATS_DAYS`=90) | não | Últimos N dias incluindo hoje. Default `DEFAULT_STATS_DAYS`=**7** se nenhum filtro de período vier. |
| `from` / `to` | `YYYY-MM-DD` | não (mas juntos) | Range explícito, alternativa a `days`. Sem limite de tamanho de range hoje. |
| `system_id` | int positivo | não | Restringe a 1 sistema. |
| `bu_id` | int positivo | não | Restringe aos sistemas vinculados a essa BU (via `systems_bus`). BU sem sistema vinculado → resposta zerada, sem erro. |
| `user_id` | int positivo | não | Escopa o agregado a **1 usuário** (investigação de acesso do usuário). **Ortogonal** a `system_id`/`bu_id`: combina com qualquer um (validado com `assertUserExists`). Aplicado a buckets, `unique_users` e `by_system` (que vira "frequência por sistema **daquele usuário**"). |

Combinações inválidas são pegas em `validateStatsFilters` (`service.ts`), **não** no Zod — são
regras de negócio que precisam de `code` próprio pro front distinguir (não o `VALIDATION_ERROR`
genérico do ZodError):

| Situação | Erro |
|---|---|
| `system_id` + `bu_id` juntos | `400 CONFLICTING_FILTERS` — um sistema já pertence a uma BU, não faz sentido os dois |
| `days` + (`from` ou `to`) juntos | `400 CONFLICTING_RANGE` |
| só `from` ou só `to` | `400 INCOMPLETE_RANGE` |
| `from` > `to` | `400 INVALID_RANGE` |

### Resposta

```json
{
  "data": {
    "range": { "from": "2025-06-30", "to": "2025-07-06", "days": 7 },
    "unique_users": 22,
    "buckets": [
      { "date": "2025-06-30", "success": 24, "fail": 0, "wrong_password": 0 },
      { "date": "2025-07-06", "success": 19, "fail": 2, "wrong_password": 1 }
    ],
    "by_system": [
      { "system_id": 3, "success": 14, "fail": 1 },
      { "system_id": 7, "success": 10, "fail": 0 }
    ]
  }
}
```

- `buckets` cobre **todo** dia do range (zero-fill), ordenado do mais antigo pro mais recente —
  mesmo dias sem nenhum acesso aparecem com `{ success: 0, fail: 0, wrong_password: 0 }`, pra barra
  ficar contínua.
- Cada bucket tem `success` (login real), `fail` (tudo que não é login real) e **`wrong_password`**
  (acessos do dia com `wrong_password=true`). `wrong_password` é **subconjunto de `fail`** (senha
  errada cai em `fail` via `isRealSuccess`) — serve pra pintar uma 3ª cor dentro da barra de falha.
- `unique_users` = `COUNT(DISTINCT user_id)` no mesmo range/filtro.
- **`by_system`** — breakdown de logins por sistema no range, um item por sistema com pelo menos um
  acesso (`{ system_id, success, fail }`), **ordenado por `success` desc** (o 1º item é o mais
  acessado → alimenta o KPI "Sistema Mais Acessado"). **Presença condicional:** só aparece quando a
  consulta **não** fixa `system_id` (com `system_id` seria 1 item só, então o campo é omitido).
  **Sem zero-fill** (≠ `buckets`): sistema sem acesso no range fica **de fora** do array. Quando `bu_id`
  filtra, o array traz só os sistemas daquela BU. A presença depende só de `system_id` ter sido
  enviado, não de haver dados — sem `system_id` e sem acessos, vem `by_system: []`.

### Implementação (`getAccessLogStats`, `service.ts`)

- **Fuso America/Sao_Paulo é decidido no SQL**, não em JS: a coluna `accessed_at` é `timestamptz`,
  então o bucket usa `(accessed_at AT TIME ZONE 'America/Sao_Paulo')::date` — só assim um acesso
  perto da meia-noite cai no dia local correto, não no dia UTC.
- Usa `prisma.$queryRaw` com `Prisma.sql`/`Prisma.join`/`Prisma.empty` — é a **exceção** à convenção
  geral de evitar SQL cru; aqui é necessário porque o Prisma Client não expressa `GROUP BY` com
  conversão de fuso. Não é create/alter de tabela, só leitura agregada — não fere a regra do
  `CLAUDE.md` sobre migrations/schema.
- `bu_id`/`system_id` são resolvidos em `system_id[]` pelo helper `resolveSystemIds` (compartilhado
  com `/wrong-password`) **antes** de montar o filtro SQL. `resolveStatsRange(query, defaultDays)`
  também é compartilhado — o `/stats` usa `DEFAULT_STATS_DAYS`=7; o `/wrong-password` usa `1` (hoje).
- `user_id` vira o fragmento `userFilter = AND su.user_id = <id>` (ou `Prisma.empty`), aplicado às
  **três** queries (buckets, `unique_users`, `by_system`) junto do `systemFilter`. Com `user_id`,
  `unique_users` é 0 ou 1 (esperado — o escopo é 1 usuário); os gráficos usam buckets + by_system.
- **"Sucesso" = login real, não linha `success=true` crua.** Desde que `auth` passou a gravar senha
  errada como `success=true` + `wrong_password=true`, o stats usa o fragmento SQL
  `isRealSuccess = (sua.success AND NOT COALESCE(sua.wrong_password, false))`. Senha errada cai em
  **`fail`**, não em `success` — preservando o comportamento do gráfico de antes da coluna existir.
  - **buckets:** uma linha por dia via `COUNT(*) FILTER (WHERE …)` → `success` (isRealSuccess),
    `fail` (`NOT isRealSuccess`) e `wrong_password` (`wrong_password = true`). `wrong_password ⊆ fail`.
  - **by_system:** ainda usa `GROUP BY su.system_id, isRealSuccess` (2 linhas por sistema), colapsado
    em `{ success, fail }` pelo `buildBySystem` — **sem** recorte de `wrong_password` (spec não pediu).
  - `unique_users` não filtra por sucesso (conta qualquer tentativa logada no range).
- `by_system` é uma **3ª query raw** no mesmo `Promise.all` (GROUP BY `su.system_id, isRealSuccess`),
  disparada só quando `includeBySystem` (sem `system_id`) — caso contrário resolve `[]` sem tocar o
  banco. O helper `buildBySystem` colapsa as linhas (system_id, success) em `{ success, fail }` por
  sistema e ordena por `success` desc. Mesmo `systemFilter` das outras queries (respeita `bu_id`).
- `todaySaoPaulo()`/`addDays()`/`daysBetween()` fazem aritmética de calendário em `YYYY-MM-DD` puro
  (via `Date.UTC`), sem depender de lib de timezone — cuidado ao mexer: não confundir com o horário
  real do servidor.

### Gotchas específicos

- **Rota "desde sempre" (primeiro log até hoje) foi cogitada e descartada por ora** — pediram
  explicitamente pra não implementar ainda. Se voltar à tona, decidir antes se é diário (buckets
  podem virar milhares) ou só totais agregados.
- `system_id` + `bu_id` juntos é erro, não um AND silencioso — o filtro reflete o vínculo real
  (sistema já pertence a uma BU só).
- Sem cap de tamanho pra `from`/`to` explícito (só `days` tem teto de 90) — um range de anos gera
  um array grande de buckets em memória; não é validado hoje.

## `GET /access-logs/wrong-password` (usuários que erraram a senha)

Lista os usuários que tiveram tentativa(s) com senha errada (`wrong_password = true`) no range,
**agregados por usuário**. Alimenta o card "quem errou a senha hoje" numa única requisição (o front
não precisa varrer logs por sistema nem cruzar `/users`).

### Query (`accessLogStatsQuerySchema` — **mesmo contrato do `/stats`**)

`days` (1–90), `from`/`to` (`YYYY-MM-DD`), `system_id`, `bu_id`. Mesmas combinações inválidas
(`validateStatsFilters`: `CONFLICTING_FILTERS`, `CONFLICTING_RANGE`, `INCOMPLETE_RANGE`,
`INVALID_RANGE`). **Diferença:** sem filtro de período → **default = hoje** (1 dia, `resolveStatsRange(query, 1)`),
não 7.

### Resposta

Array (item único, **não paginado**), um objeto por usuário, ordenado por `attempts` desc (empate:
`last_attempt_at` desc):

```json
{
  "data": [
    { "user_id": 10, "name": "Fulano", "email": "f@x.com", "attempts": 3, "last_attempt_at": "2026-07-07T14:20:00.000Z" },
    { "user_id": 22, "name": "Ciclana", "email": "c@x.com", "attempts": 1, "last_attempt_at": "2026-07-07T09:05:00.000Z" }
  ]
}
```

- **Agregação por usuário** (não por par user↔sistema): se o usuário errou em vários sistemas no
  range, as tentativas somam num item só. Filtro por `system_id`/`bu_id` restringe quais tentativas
  contam.
- `attempts` = nº de tentativas com senha errada no range; `last_attempt_at` = a mais recente.
- **Sem zero-fill:** só entram usuários com ≥1 tentativa de senha errada; range/filtro sem tentativas → `[]`.

### Implementação (`getWrongPasswordUsers`, `service.ts`)

- 1 query raw agregada (`WHERE wrong_password = true` + range no fuso São Paulo + `systemFilter`,
  `GROUP BY su.user_id`, `COUNT(*)`/`MAX(accessed_at)`) + 1 `findMany` pra resolver `name`/`email`
  em lote (sem N+1). O `cascade` garante que o user existe enquanto houver log dele.
- Reaproveita `validateStatsFilters`, `resolveStatsRange` (com `defaultDays=1`) e `resolveSystemIds`.

## `GET /access-logs/today` (lista individual dos acessos de hoje)

Lista **individual** (não agregada) de **todos** os acessos de **hoje** (fuso America/Sao_Paulo),
todos os sistemas, ordenada por `accessed_at` desc. Alimenta uma visão de "acessos de hoje" no front
sem varrer log por sistema. **Sem paginação** e **sem resolver nome/email** (o front cruza com os
stores já carregados).

### Query (`accessLogTodayQuerySchema`)

Só **`bu_id`** (int positivo, opcional) — restringe aos sistemas vinculados à BU (via `systems_bus`).
**Sem** `days`/`from`/`to` (é sempre hoje) e **sem** `system_id` (é sempre todos). BU sem sistema
vinculado → `[]`.

### Resposta

Array (item único, **não paginado**), uma linha por acesso, `accessed_at` desc:
```json
{
  "data": [
    { "user_id": 10, "system_id": 3, "accessed_at": "2026-07-07T14:20:00.000Z", "success": true, "wrong_password": false }
  ]
}
```
- `success`/`wrong_password` são os valores **crus** da linha (senha errada = `success: true` +
  `wrong_password: true`; ver módulo `auth`). Não há recorte/derivação aqui — é o log individual.

### Implementação (`getTodayAccessLogs`, `service.ts`)

- 1 query raw: `JOIN systems_users` pra trazer `user_id`/`system_id`, `WHERE (accessed_at AT TIME
  ZONE 'America/Sao_Paulo')::date = <hoje>` + `systemFilter`, `ORDER BY accessed_at DESC`.
- **Não** seleciona `sua.id` (BigInt) → sem `.toString()`; shape enxuto de propósito.
- Reaproveita `todaySaoPaulo()` e `resolveSystemIds({ bu_id })`. `bu_id` validado com `assertBuExists`.
- **Sem cap:** o volume é naturalmente limitado a 1 dia, mas não há teto explícito de linhas.
