# API.md — 3F Core API

Referência completa de endpoints da **3F Core API** (`api-universal-login`). Cobre autenticação,
formato de requisição/resposta, paginação, erros e **cada rota** (método, scope, params, query,
body e resposta).

Para o modelo de dados (tabelas/colunas/relações), veja [`DATABASE.md`](./DATABASE.md).

---

## 1. Visão geral

- **Estilo:** REST, JSON, **backend-to-backend**. Não há sessão/cookie nem OAuth de usuário final —
  toda chamada é autenticada por **API Key**.
- **Base URL:** `{BASE_URL}` para projetos hospedados na mesma VPS da API use: `localhost:3010`. Para projetos de fora use: `https://3f-core.3fventure.tech`.
  Exemplos abaixo usam caminhos relativos (ex.: `GET /users`).
- **Content-Type:** `application/json` em toda requisição com body. Tamanho máximo do body: **10 MB**.
- **Charset/Datas:** datas em **ISO 8601 / UTC** (`2026-06-22T13:45:00.000Z`). Campos `*_at` são
  `timestamptz`. Campos de data pura (`birth_date`) aceitam `YYYY-MM-DD`.

---

## 2. Autenticação

Toda rota (exceto `/health*`) exige o header:

```
X-API-Key: <sua_api_key>
```

A key tem o formato `<prefixo><32 chars>` (ex.: `3fc_dev_aB3kP9...`). Ela é vinculada a um
**`system`** e carrega um conjunto de **scopes**. O servidor:

1. valida a key (existência, `is_active`, `expires_at`);
2. valida que o `system` dono está ativo;
3. injeta o contexto do sistema na request (usado, por ex., pelo `/auth/validate`);
4. atualiza `last_used_at` da key (best-effort);
5. aplica **rate limit por key**.

> A key crua **não** é recuperável: ela é exibida **uma única vez** na criação
> (`POST /api-keys`). Guarde-a com segurança. O servidor só armazena o hash.

### Erros de autenticação/autorização

| HTTP | `code` | Quando |
|---|---|---|
| 401 | `API_KEY_MISSING` | Header `X-API-Key` ausente/vazio |
| 401 | `API_KEY_INVALID` | Key não encontrada |
| 401 | `API_KEY_INACTIVE` | Key com `is_active = false` |
| 401 | `API_KEY_EXPIRED` | Key com `expires_at` no passado |
| 403 | `SYSTEM_INACTIVE` | O `system` dono da key está desativado |
| 403 | `INSUFFICIENT_SCOPE` | A key não possui o scope exigido pela rota (`details.required`) |

### Scopes

Cada rota exige um scope no formato `<recurso>:<ação>`. Regras de cobertura:

- `admin:*` → libera **tudo**;
- `<recurso>:*` → libera todas as ações daquele recurso (ex.: `users:*`);
- senão → precisa do scope **exato** (ex.: `users:read`).

**Catálogo de scopes:** `auth:validate`, `users:{read,write,delete}`, `bus:{read,write,delete}`,
`squads:{read,write,delete}`, `departments:{read,write,delete}`, `positions:{read,write,delete}`,
`bands:{read,write,delete}`, `systems:{read,write,delete}`, `api-keys:{read,write,delete}`,
`systems-users:{read,write,delete}`, `systems-bus:{read,write,delete}`, `access-logs:read`,
e o super-scope `admin:*`.

**Tipos de key** (o cliente pede um `type`, a API expande nos scopes):

| `type` | Scopes |
|---|---|
| `adm` | `admin:*` (acesso total) |
| `login` | `auth:validate`, `users:read`, `bus:read`, `systems:read`, `positions:read`, `departments:read`, `bands:read`, `squads:read` |

---

## 3. Formato de resposta

### Item único
```json
{ "data": { "id": 1, "name": "..." } }
```

### Lista (com paginação)
```json
{
  "data": [ { "...": "..." } ],
  "meta": { "total": 137, "page": 1, "perPage": 20 }
}
```

### Paginação (query string)

| Param | Tipo | Default | Limite |
|---|---|---|---|
| `page` | inteiro > 0 | `1` | — |
| `perPage` | inteiro > 0 | `20` | máx **100** |

Vale para todos os endpoints de **lista** (os marcados com `meta`).

### Filtros (query string)

Por convenção, a query string de uma listagem carrega **apenas** `is_active` (`true`/`false`, onde o
recurso tem essa coluna), além da paginação. **Qualquer outro recorte** (por relação, busca textual,
embute de dados, intervalo de datas) é exposto como **rota dedicada**, nunca como param. Params
desconhecidos enviados na query são **ignorados** (não geram erro).

---

## 4. Erros

Envelope padrão:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos.", "details": [ ... ] } }
```

- `details` só aparece em respostas **4xx** (em 5xx nada interno é vazado).
- Erros de validação (Zod) trazem `details: [{ path, message }]`.

| HTTP | `code` | Significado |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query/params inválidos (Zod) |
| 401 | `UNAUTHORIZED` / `API_KEY_*` / `INVALID_CREDENTIALS` | Não autenticado |
| 403 | `FORBIDDEN` / `INSUFFICIENT_SCOPE` / `NO_SYSTEM_ACCESS` / `ACCOUNT_INACTIVE` / `SYSTEM_INACTIVE` | Sem permissão |
| 404 | `NOT_FOUND` / `*_NOT_FOUND` / `ROUTE_NOT_FOUND` | Recurso/rota não encontrada |
| 409 | `CONFLICT` / `FK_CONSTRAINT` / `ALREADY_LINKED` | Conflito de unicidade ou FK |
| 413 | `PAYLOAD_TOO_LARGE` | Body acima de 10 MB |
| 429 | `RATE_LIMITED` | Limite de requisições excedido |
| 500 | `INTERNAL_ERROR` | Erro interno (mensagem genérica) |

**Mapeamento Prisma:** violação de unicidade → `409 CONFLICT` (`details.target`); registro não
encontrado em update/delete → `404 NOT_FOUND`; violação de FK → `409 FK_CONSTRAINT`.

### Rate limit

Limite **por API Key** (default `100` req / `60s`; configurável por ambiente). Cabeçalhos padrão
`RateLimit-*` acompanham as respostas. Ao estourar: `429 RATE_LIMITED`.

> O store é em memória por processo. Em cluster (PM2), o limite é por instância.

---

## 5. Convenções de CRUD

- `GET /<recurso>` → lista paginada + filtros.
- `GET /<recurso>/:id` → item único (404 se não existir).
- `POST /<recurso>` → cria (**201**). Body validado por Zod.
- `PATCH /<recurso>/:id` → atualização **parcial** (só os campos enviados).
- `DELETE /<recurso>/:id` → **exclusão real** (hard delete). Resposta: `{ "data": { "id", "deleted": true } }`.
- `is_active` é **soft-disable** independente — alterado via `PATCH`, nunca apaga o registro.
- Campos `password` e `key_hash` **nunca** retornam.

---

# 6. Endpoints

## 6.1 Health — *sem autenticação*

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Liveness (não toca o banco) |
| `GET` | `/health/ready` | Readiness (faz `SELECT 1` no Postgres) |

**`GET /health`** → `200`
```json
{ "data": { "status": "ok", "service": "api-universal-login", "uptime_s": 1234, "timestamp": "2026-06-22T13:45:00.000Z" } }
```

**`GET /health/ready`** → `200` `{ "data": { "status": "ready", "database": "up" } }`
ou `503` `{ "error": { "code": "NOT_READY", "message": "Banco de dados indisponível." } }`

---

## 6.2 Auth

### `POST /auth/validate` — scope `auth:validate`

Valida e-mail + senha do usuário **no contexto do sistema da API Key** e registra o acesso.

**Body**
```json
{ "email": "fulano@empresa.com", "password": "segredo" }
```
| Campo | Regra |
|---|---|
| `email` | obrigatório, e-mail, ≤150, normalizado (trim + lowercase) |
| `password` | obrigatório, 1–72 chars |

**`200`** — usuário (sem `password`) + suas BUs:
```json
{
  "data": {
    "id": 10, "name": "Fulano", "email": "fulano@empresa.com", "role": "colaborador",
    "department_id": 3, "position_id": 5, "band_id": 2, "squad_id": 1, "is_active": true,
    "bus": [ { "id": 1, "name": "BU X", "slug": "bu-x", "from_squad": true } ]
  }
}
```

**Erros** (regras de negócio):
| HTTP | `code` | Quando | Gera log? |
|---|---|---|---|
| 401 | `INVALID_CREDENTIALS` | e-mail inexistente | não |
| 403 | `NO_SYSTEM_ACCESS` | usuário sem vínculo (`systems_users`) com este sistema | não |
| 403 | `ACCOUNT_INACTIVE` | conta inativa (com vínculo) | **sim** (`success=false`) |
| 401 | `INVALID_CREDENTIALS` | senha errada (com vínculo) | **sim** (`success=false`) |
| 200 | — | sucesso | **sim** (`success=true`) |

---

## 6.3 Users — scopes `users:read` / `users:write` / `users:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/users` | `users:read` |
| `GET` | `/users/photos` | `users:read` |
| `GET` | `/users/:id` | `users:read` |
| `POST` | `/users` | `users:write` |
| `PATCH` | `/users/:id` | `users:write` |
| `DELETE` | `/users/:id` | `users:delete` |

**`GET /users`** — query: só `page`, `perPage`, `is_active` (`true`/`false`). Filtros antigos
(`bu_id`, `squad_id`, `department_id`, busca textual) viraram rotas dedicadas. Cada item vem **sem
`password`** e **sem `profile_picture`** (a foto é base64 pesada e travava a lista — ver
`GET /users/photos`), com `bus: [...]` (BUs do usuário, cada uma com `from_squad`).

**`GET /users/photos`** — fotos de perfil **em lote**, para a lista exibir avatares sem carregar
base64 no `GET /users`. Query: `ids` = inteiros positivos separados por vírgula (`?ids=1,2,3`),
**deduplicado** e **limitado a 50 ids** por requisição. Responde um **mapa** `{ <id>: profile_picture }`
só com os ids que existem (a foto pode ser `null`); ids inexistentes são omitidos. Ex.: `?ids=10,15` →

```json
{ "data": { "10": "data:image/jpeg;base64,...", "15": null } }
```

Manda `Cache-Control: private, max-age=300` (foto muda raramente). Fluxo recomendado: o front
renderiza os cards leves do `GET /users` e **depois** chama esta rota com os ids da página visível
(ou dos resultados de uma busca) — uma requisição cacheável, não uma por usuário. 400 se `ids`
faltar, tiver valor não-inteiro/≤0, ou passar de 50.

**`GET /users/:id`** → item único + `bus`, **com `profile_picture`**. 404 `USER_NOT_FOUND`.

**`POST /users`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `name` | string | ✅ | 1–150 |
| `email` | string | ✅ | e-mail, ≤150, único |
| `password` | string | ✅ | 8–72 |
| `role` | string | ✅ | 1–50 |
| `personal_email` | string | — | e-mail, ≤150 |
| `birth_date` | date | — | `YYYY-MM-DD` |
| `cpf` | string | — | ≤14, único |
| `cnpj` | string | — | ≤18, único |
| `sex` | string | — | ≤10 |
| `phone` | string | — | ≤20 |
| `instagram` | string | — | ≤100 |
| `linkedin` | string | — | ≤200 |
| `department_id` | int | — | FK |
| `position_id` | int | — | FK |
| `band_id` | int | — | FK |
| `squad_id` | int | — | FK |
| `bus` | array | — | `[{ "bu_id": int, "from_squad": bool=false }]` — grava os vínculos N:N |
| `profile_picture` | string | — | imagem base64 (data URI) ou URL; **não** volta no `GET /users` — só em `/users/:id` e `/users/photos` |
| `cep`,`street`,`street_number`,`neighborhood`,`complement`,`city`,`state`,`country` | string | — | endereço (tamanhos variados) |
| `is_active` | bool | — | default no banco = `true` |

> `from_squad` vem **do cliente** (o front identifica a BU do squad e marca `true`). A API só
> persiste — não sincroniza com `squad.bu_id`.
> Cada `bus[].bu_id` é validado (404 `BU_NOT_FOUND` se não existir). `email`/`cpf`/`cnpj`
> duplicados → 409.

**`PATCH /users/:id`** → todos os campos opcionais (parcial). Regra do `bus`: **ausente** = não
mexe nos vínculos; **presente** = **substitui** o conjunto inteiro. Enviar `password` re-hasheia.

**`DELETE /users/:id`** → `{ "id": <id>, "deleted": true }`. Cascateia `users_bus`, `systems_users`
e respectivos `systems_users_access`.

---

## 6.4 API Keys — scopes `api-keys:read` / `api-keys:write` / `api-keys:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/api-keys` | `api-keys:read` |
| `GET` | `/api-keys/types` | `api-keys:read` |
| `GET` | `/api-keys/:id` | `api-keys:read` |
| `POST` | `/api-keys` | `api-keys:write` |
| `PATCH` | `/api-keys/:id` | `api-keys:write` |
| `DELETE` | `/api-keys/:id` | `api-keys:delete` |

**`GET /api-keys`** — query: só `page`, `perPage`, `is_active` (o filtro por `system_id` virou rota).
Itens **sem `key_hash`**, com `type` derivado dos scopes (`adm` | `login` | `null`).

**`GET /api-keys/types`** — catálogo de tipos para montar seletor:
```json
{ "data": [ { "type": "adm", "label": "Administrador", "description": "...", "scopes": ["admin:*"] } ],
  "meta": { "total": 2, "page": 1, "perPage": 2 } }
```

**`GET /api-keys/:id`** → item (sem `key_hash`). 404 `API_KEY_NOT_FOUND`.

**`POST /api-keys`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `system_id` | int | ✅ | FK → `system` (404 `SYSTEM_NOT_FOUND`) |
| `name` | string | ✅ | 1–150 |
| `type` | enum | ✅ | `adm` ou `login` (scopes crus **não** são aceitos) |
| `created_by` | int | — | FK → `user` (404 `CREATED_BY_NOT_FOUND` se enviado e inexistente) |
| `expires_at` | date | — | expiração (omitir = não expira) |

Resposta **inclui a key crua uma única vez**:
```json
{
  "data": {
    "id": 7, "system_id": 2, "name": "Login Web", "key_prefix": "3fc_dev_aB",
    "scopes": ["auth:validate","users:read","..."], "type": "login", "is_active": true,
    "key": "3fc_dev_aB3kP9x...",
    "_warning": "Guarde esta key agora. Ela não poderá ser recuperada novamente."
  }
}
```

**`PATCH /api-keys/:id`** — campos: `name?`, `type?` (regera os scopes), `is_active?`,
`expires_at?` (aceita `null` para remover a expiração).

**`DELETE /api-keys/:id`** → `{ "id", "deleted": true }`.

---

## 6.5 BUs (Business Units) — scopes `bus:read` / `bus:write` / `bus:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/bus` | `bus:read` |
| `GET` | `/bus/tree` | `bus:read` |
| `GET` | `/bus/:id` | `bus:read` |
| `POST` | `/bus` | `bus:write` |
| `PATCH` | `/bus/:id` | `bus:write` |
| `DELETE` | `/bus/:id` | `bus:delete` |

**`GET /bus`** — query: só `page`, `perPage`, `is_active` (filtro por `parent_id` e busca por
nome/slug viraram rotas).

**`GET /bus/tree`** — árvore hierárquica completa (item único, **não paginado**). Raízes têm
`parent_id = null`; cada nó tem `children: [...]` recursivo:
```json
{ "data": [ { "id": 1, "name": "Matriz", "parent_id": null, "children": [ { "id": 2, "parent_id": 1, "children": [] } ] } ] }
```

**`GET /bus/:id`** → item. 404 `BU_NOT_FOUND`.

**`POST /bus`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `name` | string | ✅ | 1–100 |
| `slug` | string | ✅ | 1–100, **único**, regex `^[a-z0-9-]+$` |
| `description` | string | — | |
| `primary_color_hex` | string | — | `#RRGGBB` |
| `secondary_color_hex` | string | — | `#RRGGBB` |
| `parent_id` | int | — | FK → `bu` (404 `BU_NOT_FOUND` se enviado e inexistente) |
| `logo_picture` | string | — | URL / caminho |
| `is_active` | bool | — | |

**`PATCH /bus/:id`** — parcial. `parent_id` não pode ser o próprio `id` (400 `INVALID_PARENT`).

**`DELETE /bus/:id`** → `{ "id", "deleted": true }`. Cascateia `users_bus` e `systems_bus`.

---

## 6.6 Squads — scopes `squads:read` / `squads:write` / `squads:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/squads` | `squads:read` |
| `GET` | `/squads/:id` | `squads:read` |
| `GET` | `/squads/:id/users` | **`users:read`** (devolve PII) |
| `POST` | `/squads` | `squads:write` |
| `PATCH` | `/squads/:id` | `squads:write` |
| `DELETE` | `/squads/:id` | `squads:delete` |

**`GET /squads`** — query: só `page`, `perPage`, `is_active` (filtros por `bu_id`/`leader_id`/busca
viraram rotas).

**`GET /squads/:id`** → item. 404 `SQUAD_NOT_FOUND`.

**`GET /squads/:id/users`** — usuários do squad (via `user.squad_id`), paginado, cada um sem
`password` e com `bus`. Valida o squad (404 `SQUAD_NOT_FOUND`).

**`POST /squads`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `name` | string | ✅ | 1–150 |
| `leader_id` | int | ✅ | FK → `user` (404 `LEADER_NOT_FOUND`) |
| `description` | string | — | |
| `picture` | string | — | |
| `bu_id` | int | — | FK → `bu` (404 `BU_NOT_FOUND` se enviado) |
| `is_active` | bool | — | |

**`PATCH /squads/:id`** — parcial (`name?`, `description?`, `picture?`, `leader_id?`, `bu_id?`,
`is_active?`). `leader_id`/`bu_id` validados se enviados.

**`DELETE /squads/:id`** → `{ "id", "deleted": true }`.

---

## 6.7 Departments — scopes `departments:read` / `:write` / `:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/departments` | `departments:read` |
| `GET` | `/departments/:id` | `departments:read` |
| `POST` | `/departments` | `departments:write` |
| `PATCH` | `/departments/:id` | `departments:write` |
| `DELETE` | `/departments/:id` | `departments:delete` |

**`GET /departments`** — query: só `page`, `perPage`, `is_active` (busca por nome virou rota).
**`GET /departments/:id`** → 404 `DEPARTMENT_NOT_FOUND`.

**`POST /departments`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `name` | string | ✅ | 1–100 |
| `icon` | string | — | ≤100 |
| `is_active` | bool | — | |
| `created_by` | int | — | FK → `user` (validado se enviado → 404 `CREATED_BY_NOT_FOUND`) |

**`PATCH /departments/:id`** — `name?`, `icon?`, `is_active?` (`created_by` **não** é alterável).
**`DELETE`** → `{ "id", "deleted": true }`.

---

## 6.8 Positions (cargos) — scopes `positions:read` / `:write` / `:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/positions` | `positions:read` |
| `GET` | `/positions/:id` | `positions:read` |
| `POST` | `/positions` | `positions:write` |
| `PATCH` | `/positions/:id` | `positions:write` |
| `DELETE` | `/positions/:id` | `positions:delete` |

**`GET /positions`** — query: só `page`, `perPage`, `is_active` (busca por nome virou rota).
**`GET /positions/:id`** → 404 `POSITION_NOT_FOUND`.

**`POST /positions`** → `201`. Body: `name` (✅, 1–100), `is_active?`, `created_by?`
(FK → `user`, validado se enviado → 404 `CREATED_BY_NOT_FOUND`).

**`PATCH /positions/:id`** — `name?`, `is_active?`. **`DELETE`** → `{ "id", "deleted": true }`.

---

## 6.9 Bands — scopes `bands:read` / `:write` / `:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/bands` | `bands:read` |
| `GET` | `/bands/:id` | `bands:read` |
| `POST` | `/bands` | `bands:write` |
| `PATCH` | `/bands/:id` | `bands:write` |
| `DELETE` | `/bands/:id` | `bands:delete` |

**`GET /bands`** — query: só `page`, `perPage`, `is_active` (busca por nome virou rota). Ordenado por
`sort_order`, depois `name`.
**`GET /bands/:id`** → 404 `BAND_NOT_FOUND`.

**`POST /bands`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `name` | string | ✅ | 1–100 |
| `color_hex` | string | — | `#RRGGBB` |
| `icon` | string | — | 1–100 |
| `sort_order` | int | — | ≥ 0 (default 0) |
| `is_active` | bool | — | |
| `created_by` | int | — | FK → `user` (validado se enviado → 404 `CREATED_BY_NOT_FOUND`) |

**`PATCH /bands/:id`** — `name?`, `color_hex?`, `icon?`, `sort_order?`, `is_active?`.
**`DELETE`** → `{ "id", "deleted": true }`.

---

## 6.10 Systems — scopes `systems:read` / `:write` / `:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/systems` | `systems:read` |
| `GET` | `/systems/:id` | `systems:read` |
| `POST` | `/systems` | `systems:write` |
| `PATCH` | `/systems/:id` | `systems:write` |
| `DELETE` | `/systems/:id` | `systems:delete` |

**`GET /systems`** — query: só `page`, `perPage`, `is_active` (busca por nome e o embute `include=bus`
viraram rotas).
**`GET /systems/:id`** → 404 `SYSTEM_NOT_FOUND`.

**`POST /systems`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `name` | string | ✅ | 1–150 |
| `description` | string | — | |
| `link` | string | — | URL válida, ≤500 |
| `logo_picture` | string | — | |
| `is_active` | bool | — | |

**`PATCH /systems/:id`** — parcial (mesmos campos). **`DELETE`** → `{ "id", "deleted": true }`.
Cascateia `api_key`, `systems_users` e `systems_bus`.

---

## 6.11 Systems ↔ Users — scopes `systems-users:read` / `:write` / `:delete`

Vínculo N:N entre sistema e usuário (com `role` por sistema).

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/systems/:systemId/users` | `systems-users:read` |
| `POST` | `/systems/:systemId/users` | `systems-users:write` |
| `DELETE` | `/systems/:systemId/users/:userId` | `systems-users:delete` |
| `GET` | `/users/:userId/systems` | `systems-users:read` |
| `PUT` | `/users/:userId/systems` | `systems-users:write` |

**`GET /systems/:systemId/users`** — usuários vinculados (paginado, sem `password`). Valida o
sistema (404 `SYSTEM_NOT_FOUND`).

**`POST /systems/:systemId/users`** → `201`. Body `{ "user_id": int, "created_by"?: int }`
(`created_by` é aceito por compat mas **não** persistido — a tabela não tem essa coluna). 409
`ALREADY_LINKED` se já existir. Resposta: o registro do vínculo (`systems_users`).

**`DELETE /systems/:systemId/users/:userId`** → `{ "system_id", "user_id", "deleted": true }`.
404 `LINK_NOT_FOUND` se não havia vínculo.

**`GET /users/:userId/systems`** — acessos do usuário (item único, **não paginado**):
```json
{ "data": [ { "system_id": 2, "role": "admin" }, { "system_id": 5, "role": null } ] }
```
Valida o usuário (404 `USER_NOT_FOUND`).

**`PUT /users/:userId/systems`** — **substitui** todos os vínculos do usuário numa transação. Body:
```json
{ "systems": [ { "system_id": 2, "role": "admin" }, { "system_id": 5, "role": "viewer" } ] }
```
`role` é obrigatório por item; deduplica por `system_id`; valida cada sistema (404
`SYSTEM_NOT_FOUND`). Resposta: a lista resultante `[{ system_id, role }]`.

---

## 6.12 Systems ↔ BUs — scopes `systems-bus:read` / `:write` / `:delete`

Vínculo N:N entre sistema e BU.

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/systems/:systemId/bus` | `systems-bus:read` |
| `PUT` | `/systems/:systemId/bus` | `systems-bus:write` |
| `POST` | `/systems/:systemId/bus` | `systems-bus:write` |
| `DELETE` | `/systems/:systemId/bus/:buId` | `systems-bus:delete` |
| `GET` | `/bus/:buId/systems` | `systems-bus:read` |

**`GET /systems/:systemId/bus`** — ids das BUs vinculadas (item único, não paginado):
`{ "data": [ { "bu_id": 1 }, { "bu_id": 3 } ] }`. Valida sistema (404 `SYSTEM_NOT_FOUND`).

**`PUT /systems/:systemId/bus`** — **substitui** todos os vínculos numa transação. Body
`{ "bu_ids": [1, 3, 7] }`. Deduplica; valida cada BU (404 `BU_NOT_FOUND`). Resposta: `[{ bu_id }]`.

**`POST /systems/:systemId/bus`** → `201`. Body `{ "bu_id": int }`. 409 `ALREADY_LINKED` se
já existir. Resposta: o registro do vínculo (`systems_bus`).

**`DELETE /systems/:systemId/bus/:buId`** → `{ "system_id", "bu_id", "deleted": true }`.
404 `LINK_NOT_FOUND`.

**`GET /bus/:buId/systems`** — visão inversa: sistemas vinculados a uma BU (paginado). Valida a BU
(404 `BU_NOT_FOUND`).

---

## 6.13 Access Logs — scope `access-logs:read`

Leitura dos logs de acesso (`systems_users_access`). Somente leitura — os logs são gerados pelo
`POST /auth/validate`. ⚠️ O campo `id` do log é **BigInt**, serializado como **string**.

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/systems/:systemId/access-logs` | `access-logs:read` |
| `GET` | `/users/:userId/access-logs` | `access-logs:read` |

**`GET /systems/:systemId/access-logs`** — query: só `page`, `perPage` (filtros `success`/`from`/`to`/
`user_id` viraram rotas; `access-logs` não tem `is_active`). Valida sistema (404 `SYSTEM_NOT_FOUND`).

**`GET /users/:userId/access-logs`** — query: só `page`, `perPage` (filtros `success`/`from`/`to`/
`system_id` viraram rotas). Valida usuário (404 `USER_NOT_FOUND`).

Ambos ordenados por `accessed_at` desc. Item:
```json
{
  "id": "10482",
  "systems_users_id": 12,
  "user_id": 10,
  "system_id": 2,
  "success": true,
  "accessed_at": "2026-06-22T13:45:00.000Z"
}
```

---

## 7. Resumo de todos os endpoints

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/health`, `/health/ready` | *(sem auth)* |
| `POST` | `/auth/validate` | `auth:validate` |
| `GET` | `/users` · `/users/photos` · `/users/:id` | `users:read` |
| `POST` | `/users` | `users:write` |
| `PATCH` | `/users/:id` | `users:write` |
| `DELETE` | `/users/:id` | `users:delete` |
| `GET` | `/api-keys` · `/api-keys/types` · `/api-keys/:id` | `api-keys:read` |
| `POST` | `/api-keys` | `api-keys:write` |
| `PATCH` | `/api-keys/:id` | `api-keys:write` |
| `DELETE` | `/api-keys/:id` | `api-keys:delete` |
| `GET` | `/bus` · `/bus/tree` · `/bus/:id` | `bus:read` |
| `POST` | `/bus` | `bus:write` |
| `PATCH` | `/bus/:id` | `bus:write` |
| `DELETE` | `/bus/:id` | `bus:delete` |
| `GET` | `/squads` · `/squads/:id` | `squads:read` |
| `GET` | `/squads/:id/users` | `users:read` |
| `POST` | `/squads` | `squads:write` |
| `PATCH` | `/squads/:id` | `squads:write` |
| `DELETE` | `/squads/:id` | `squads:delete` |
| `GET/POST/PATCH/DELETE` | `/departments[/:id]` | `departments:{read,write,delete}` |
| `GET/POST/PATCH/DELETE` | `/positions[/:id]` | `positions:{read,write,delete}` |
| `GET/POST/PATCH/DELETE` | `/bands[/:id]` | `bands:{read,write,delete}` |
| `GET` | `/systems` · `/systems/:id` | `systems:read` |
| `POST/PATCH/DELETE` | `/systems[/:id]` | `systems:{write,delete}` |
| `GET` | `/systems/:systemId/users` · `/users/:userId/systems` | `systems-users:read` |
| `POST` | `/systems/:systemId/users` | `systems-users:write` |
| `PUT` | `/users/:userId/systems` | `systems-users:write` |
| `DELETE` | `/systems/:systemId/users/:userId` | `systems-users:delete` |
| `GET` | `/systems/:systemId/bus` · `/bus/:buId/systems` | `systems-bus:read` |
| `POST` | `/systems/:systemId/bus` | `systems-bus:write` |
| `PUT` | `/systems/:systemId/bus` | `systems-bus:write` |
| `DELETE` | `/systems/:systemId/bus/:buId` | `systems-bus:delete` |
| `GET` | `/systems/:systemId/access-logs` · `/users/:userId/access-logs` | `access-logs:read` |
