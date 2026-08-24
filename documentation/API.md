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

> Algumas ações sensíveis exigem **`admin:*` diretamente** (não basta o scope do recurso). Hoje é o
> caso de `POST /users/:id/reset-password` — só uma key do tipo `adm` consegue.

**Catálogo de scopes:** `auth:validate`, `users:{read,write,delete}`, `bus:{read,write,delete}`,
`squads:{read,write,delete}`, `departments:{read,write,delete}`, `positions:{read,write,delete}`,
`bands:{read,write,delete}`, `systems:{read,write,delete}`, `api-keys:{read,write,delete}`,
`systems-users:{read,write,delete}`, `systems-bus:{read,write,delete}`, `access-logs:read`,
`clients:{read,write}`, e o super-scope `admin:*`.

> **`clients` não tem scope `:delete`** — o recurso não expõe hard delete (ver §6.14). Desativar é
> `PATCH { is_active: false }`, coberto por `clients:write`.
>
> **`/clients/*` exige key `adm` (`admin:*`) — decisão tomada em 2026-07-30.** Os scopes
> `clients:read`/`clients:write` existem no catálogo, mas **de propósito não** foram incluídos no tipo
> `login`, e **não haverá** um tipo intermediário para "só ler clientes". Quem precisa de dados de
> cliente recebe uma key `adm`. Não monte scopes crus nem crie tipo novo sem revisitar esta decisão.

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

> **Exceção: `clients` não tem `DELETE`.** É o único recurso sem hard delete — há histórico
> financeiro apontando para o cliente de outro banco, sem FK real (ver §6.14). Desativar é
> `PATCH { "is_active": false }`.

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
    "department_id": 3, "position_id": 5, "band_id": 2, "squad_id": 1, "leader_id": null,
    "is_active": true,
    "bus": [ { "id": 1, "name": "BU X", "slug": "bu-x", "from_squad": true } ]
  }
}
```

**Erros** (regras de negócio):
| HTTP | `code` | Quando | Gera log? |
|---|---|---|---|
| 401 | `INVALID_CREDENTIALS` | e-mail inexistente | não |
| 403 | `NO_SYSTEM_ACCESS` | usuário sem vínculo (`systems_users`) com este sistema | não |
| 403 | `ACCOUNT_INACTIVE` | conta inativa (com vínculo) | **sim** (`success=false`, `wrong_password=false`) |
| 401 | `INVALID_CREDENTIALS` | senha errada (com vínculo) | **sim** (`success=true`, `wrong_password=true`) |
| 200 | — | sucesso | **sim** (`success=true`, `wrong_password=false`) |

> **Nota sobre `success`:** senha errada é logada com `success=true` + `wrong_password=true` (é uma
> tentativa legítima de usuário com acesso, só com a senha incorreta). Para contar **logins reais**,
> use `success=true AND NOT wrong_password` — é o que o `/access-logs/stats` já faz.

---

## 6.3 Users — scopes `users:read` / `users:write` / `users:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/users` | `users:read` |
| `GET` | `/users/photos` | `users:read` |
| `GET` | `/users/:id` | `users:read` |
| `GET` | `/users/:id/led` | `users:read` |
| `POST` | `/users` | `users:write` |
| `POST` | `/users/:id/reset-password` | **`admin:*`** |
| `PATCH` | `/users/:id` | `users:write` |
| `DELETE` | `/users/:id` | `users:delete` |

**`GET /users`** — filtros (query): `page`, `perPage`, `is_active` (`true`/`false`). Lista **leve**:
cada item vem **sem `password`**, **sem `profile_picture`** e **sem `contract_base64`** (base64
pesados — ver seção de fotos abaixo), com `bus: [...]` (BUs do usuário, cada uma com `from_squad`).
`contract_link`, `contract_id_clicksign` e `envelope_id_clicksign` **não** são omitidos — aparecem
normal na listagem (são strings curtas).

**`GET /users/photos`** — busca **fotos em lote**, para hidratar a lista acima. Query
`?ids=1,2,3` (CSV de inteiros positivos, deduplicado, **máx. 50 ids** por requisição). Resposta:
mapa `{ "<id>": "<profile_picture ou null>" }` só com os ids que existem. Resposta traz header
`Cache-Control: private, max-age=300` (é `GET`, não `POST`, de propósito — o navegador cacheia).

**`GET /users/:id`** → item único + `bus`, **com** `profile_picture` e `contract_base64`. 404
`USER_NOT_FOUND`.

**`GET /users/:id/led`** — usuários **liderados** por `:id` (via `user.leader_id`), no mesmo formato
leve de `GET /users` (paginado, sem `profile_picture`, com `bus`). Valida o líder (404
`LEADER_NOT_FOUND`).

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
| `leader_id` | int | — | FK auto-referente → `user` (404 `LEADER_NOT_FOUND` se enviado e inexistente). Aceita `null` |
| `bus` | array | — | `[{ "bu_id": int, "from_squad": bool=false }]` — grava os vínculos N:N |
| `profile_picture` | string | — | URL / caminho / base64 |
| `contract_link` | string | — | ≤500. Link do contrato (ex.: Google Drive). Sem relação com outra tabela |
| `contract_base64` | string | — | Base64 do contrato. Omitido em `GET /users` (ver acima), disponível em `GET /users/:id` |
| `contract_id_clicksign` | string | — | ≤100. Id do **documento** do contrato na Clicksign. Não é validado contra a Clicksign, não é único. Aparece normal na listagem |
| `envelope_id_clicksign` | string | — | ≤100. Id do **envelope** da Clicksign que contém o documento. Mesmas regras do campo acima |
| `cep`,`street`,`street_number`,`neighborhood`,`complement`,`city`,`state`,`country` | string | — | endereço (tamanhos variados) |
| `is_active` | bool | — | default no banco = `true` |

> `from_squad` vem **do cliente** (o front identifica a BU do squad e marca `true`). A API só
> persiste — não sincroniza com `squad.bu_id`.
> Cada `bus[].bu_id` é validado (404 `BU_NOT_FOUND` se não existir). `email`/`cpf`/`cnpj`
> duplicados → 409.

**`PATCH /users/:id`** → todos os campos opcionais (parcial). Regra do `bus`: **ausente** = não
mexe nos vínculos; **presente** = **substitui** o conjunto inteiro. Enviar `password` re-hasheia.
`leader_id` não pode ser o próprio `id` (400 `INVALID_LEADER`); se enviado e diferente, é validado
(404 `LEADER_NOT_FOUND`).

**`DELETE /users/:id`** → `{ "id": <id>, "deleted": true }`. Cascateia `users_bus`, `systems_users`
e respectivos `systems_users_access`.

**`POST /users/:id/reset-password`** — scope **`admin:*`** (só token full-access; **não** basta
`users:write`). Reseta a senha do usuário para a **senha padrão** da 3F (a API guarda o hash pronto;
não recebe body). Funciona para conta ativa ou inativa. 404 `USER_NOT_FOUND` se o id não existir.
Resposta:
```json
{ "data": { "id": 10, "password_reset": true } }
```

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

**`GET /api-keys`** — filtros: `page`, `perPage`, `is_active`. Itens **sem `key_hash`**,
com `type` derivado dos scopes (`adm` | `login` | `null`).

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

**`GET /bus`** — filtros: `page`, `perPage`, `is_active`.
Cada BU vem com o **shape completo da tabela** — incluindo os 14 campos de identidade jurídica,
endereço e domínio (`legal_name`, `legal_nature`, `cnpj`, `email`, `phone`, `cep`, `street`,
`street_number`, `complement`, `neighborhood`, `city`, `state`, `country`, `email_domain`), com
`null` onde não preenchido. **Não há
projeção reduzida na listagem** (ao contrário de `GET /clients`, que omite `logo_picture`): quem
monta um catálogo de BUs a partir de `GET /bus` já recebe tudo, sem precisar de um `GET /bus/:id`
por BU. Vale igualmente para `GET /bus/tree` e para a BU embutida em `POST /auth/validate`,
`GET /users/:id` e `GET /systems/with-bus`.

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
| `legal_name` | string | — | Razão social (parte CONTRATANTE em contratos) |
| `legal_nature` | string | — | Natureza jurídica (ex.: `Sociedade Empresária Limitada`) |
| `cnpj` | string | — | ≤18. Guardado **como enviado** (com ou sem máscara). **Não é único** |
| `email` | string | — | ≤150, formato de e-mail, normalizado p/ minúsculas. **Não é único** |
| `phone` | string | — | ≤20 |
| `cep` | string | — | ≤9 |
| `street` | string | — | ≤200 |
| `street_number` | string | — | ≤20 (string: `123-A`, `S/N`) |
| `complement` | string | — | ≤200 |
| `neighborhood` | string | — | ≤100 |
| `city` | string | — | ≤100 |
| `state` | string | — | ≤50. UF — string livre, sem validação de 2 letras |
| `country` | string | — | ≤50 |
| `email_domain` | string | — | ≤255. Domínio corporativo, **sem `@`** (ex.: `3fventure.com.br`). Normalizado na escrita — ver nota |
| `is_active` | bool | — | |

**`PATCH /bus/:id`** — parcial. `parent_id` não pode ser o próprio `id` (400 `INVALID_PARENT`).
Semântica de campo (a mesma de `users`/`clients`): **omitido** = não mexe no valor gravado;
enviado como **`null`** = **limpa** o valor (grava `NULL`). Ou seja, `PATCH { "city": null }` apaga
só a cidade e não toca em `legal_name`; e um `PATCH { "name": "..." }` sem os campos novos preserva
tudo que já estava salvo neles.

> **`email_domain` é normalizado pela API na escrita.** Antes de validar, a API remove um `@` inicial
> e aplica minúsculas — `"@Bommamkt.com.BR"` é gravado como `"bommamkt.com.br"`. Depois disso o valor
> precisa casar com `^[a-z0-9.-]+\.[a-z]{2,}$`; o que não casar (string vazia, espaço, `@` no meio,
> sem TLD) vira `400 VALIDATION_ERROR`, não dado quebrado.
>
> A garantia serve a quem **lê**: o valor no banco nunca tem `@` nem maiúscula, então
> `usuario + "@" + email_domain` é seguro sem tratamento adicional. **Não normalize de novo no seu
> lado** — não é necessário, e uma segunda normalização divergente só cria discrepância.

**`DELETE /bus/:id`** → `{ "id", "deleted": true }`. Cascateia `users_bus` e `systems_bus`.

---

## 6.6 Squads — scopes `squads:read` / `squads:write` / `squads:delete`

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/squads` | `squads:read` |
| `GET` | `/squads/:id` | `squads:read` |
| `GET` | `/squads/:id/users` | **`users:read`** (devolve PII) |
| `GET` | `/squads/:id/members` | **`users:read`** (devolve PII) |
| `POST` | `/squads` | `squads:write` |
| `PATCH` | `/squads/:id` | `squads:write` |
| `DELETE` | `/squads/:id` | `squads:delete` |

**`GET /squads`** — filtros: `page`, `perPage`, `is_active`.

**`GET /squads/:id`** → item. 404 `SQUAD_NOT_FOUND`.

**`GET /squads/:id/users`** — usuários do squad (via `user.squad_id`), paginado, cada um sem
`password` e com `bus`. Valida o squad (404 `SQUAD_NOT_FOUND`).

**`GET /squads/:id/members`** — membros do squad em formato **enxuto e já resolvido** (nomes, não
ids), pensado pro card de squad sem precisar cruzar `/positions`, `/bands`, `/departments`. Membro =
`{ user.squad_id == squad.id, is_active = true } ∪ { líder }` (o líder sempre entra, mesmo inativo).
Paginado; líder flutua para o topo da página (`is_leader: true`). Valida o squad (404
`SQUAD_NOT_FOUND`). Item:
```json
{
  "id": 10, "name": "Fulano", "email": "fulano@empresa.com", "profile_picture": null,
  "position": { "id": 5, "name": "Dev" },
  "band": { "id": 2, "name": "B2", "color_hex": "#00AABB", "icon": "star" },
  "department": { "id": 3, "name": "Engenharia", "icon": "code" },
  "bus": [ { "id": 1, "name": "BU X", "slug": "bu-x", "primary_color_hex": "#FF0000", "from_squad": true } ],
  "is_leader": true
}
```
`position`/`band`/`department` podem ser `null` (FK nullable); `bus` é sempre array.

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

**`GET /departments`** — filtros: `page`, `perPage`, `is_active`.
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

**`GET /positions`** — filtros: `page`, `perPage`, `is_active`.
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

**`GET /bands`** — filtros: `page`, `perPage`, `is_active`. Ordenado por `sort_order`, depois `name`.
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

**`GET /systems`** — filtros: `page`, `perPage`, `is_active`.

**`GET /systems/with-bus`** — mesma listagem paginada, mas cada sistema já traz o array **`bus`**
com as **BUs completas** vinculadas a ele (via `systems_bus`), ordenadas por nome. Sistema sem BU
vem com `bus: []`. Feita para telas que exibem sistemas + suas BUs de uma vez, evitando o N+1 de
chamar `GET /systems/:systemId/bus` por sistema. Custo fixo no servidor (não cresce com o número de
sistemas). Query: `page`, `perPage`, `is_active`. Cada BU embutida tem o shape completo da tabela
`bu` (`id`, `name`, `slug`, `description`, `primary_color_hex`, `secondary_color_hex`, `parent_id`,
`logo_picture`, `is_active`, `created_at`, `updated_at`):
```json
{
  "data": [
    {
      "id": 2, "name": "Portal RH", "description": null, "link": "https://rh.3f...",
      "logo_picture": null, "is_active": true,
      "bus": [
        { "id": 1, "name": "BU X", "slug": "bu-x", "primary_color_hex": "#FF0000",
          "logo_picture": "https://...", "parent_id": null, "is_active": true }
      ]
    }
  ],
  "meta": { "total": 12, "page": 1, "perPage": 20 }
}
```

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
| `POST` | `/systems/:systemId/users/batch` | `systems-users:write` |
| `DELETE` | `/systems/:systemId/users/batch` | `systems-users:delete` |
| `DELETE` | `/systems/:systemId/users/:userId` | `systems-users:delete` |
| `GET` | `/users/:userId/systems` | `systems-users:read` |
| `PUT` | `/users/:userId/systems` | `systems-users:write` |

**`GET /systems/:systemId/users`** — usuários vinculados (paginado, sem `password` e sem
`profile_picture` — base64 pesado, use `GET /users/photos?ids=...` para a foto). Valida o sistema
(404 `SYSTEM_NOT_FOUND`).

**`POST /systems/:systemId/users`** → `201`. Body `{ "user_id": int, "created_by"?: int }`
(`created_by` é aceito por compat mas **não** persistido — a tabela não tem essa coluna). 409
`ALREADY_LINKED` se já existir. Resposta: o registro do vínculo (`systems_users`).

**`POST /systems/:systemId/users/batch`** → `201`. Dá acesso ao sistema a **vários usuários** numa
requisição. Body:
```json
{ "user_ids": [3, 5, 8] }
```
| Campo | Tipo | Regra |
|---|---|---|
| `user_ids` | int[] | obrigatório, **1 a 100** ids positivos; duplicados são ignorados |

**Idempotente** (≠ do POST único): usuários **já vinculados não dão erro** — são ignorados e
devolvidos em `already_linked`. Os vínculos criados ficam com `role` nulo (para definir `role`, use
`PUT /users/:userId/systems`). Valida o sistema (404 `SYSTEM_NOT_FOUND`) e **todos** os `user_ids`
**antes** de gravar: se algum id não existir → `404 USER_NOT_FOUND` com `details.missing` listando os
ausentes (nada é vinculado — tudo ou nada na validação). Resposta:
```json
{
  "data": {
    "system_id": 2,
    "linked": [5, 8],
    "already_linked": [3],
    "count": 2
  }
}
```
- `linked` — ids **recém-vinculados** nesta chamada. `already_linked` — ids que **já tinham** acesso
  (ignorados). `count` = tamanho de `linked` (vínculos novos). Ambos os arrays vêm ordenados.

**`DELETE /systems/:systemId/users/batch`** → `200`. Remove o acesso de **vários usuários** ao
sistema numa requisição. Corpo **JSON** (mesmo shape do POST batch):
```json
{ "user_ids": [3, 5, 8] }
```
| Campo | Tipo | Regra |
|---|---|---|
| `user_ids` | int[] | obrigatório, **1 a 100** ids positivos; duplicados são ignorados |

**Idempotente** (≠ do DELETE único): usuário que **não tinha vínculo** (ou id inexistente) **não** dá
erro — é ignorado e devolvido em `not_linked`. Valida só o sistema (404 `SYSTEM_NOT_FOUND`) — não
valida existência dos usuários (remover acesso de quem não tem é inócuo). Resposta:
```json
{
  "data": {
    "system_id": 2,
    "unlinked": [3, 5],
    "not_linked": [8],
    "count": 2
  }
}
```
- `unlinked` — ids que **tinham** acesso e foram removidos. `not_linked` — ids que **não tinham**
  vínculo (ignorados). `count` = tamanho de `unlinked`. Ambos os arrays vêm ordenados.

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
A chave `role` é obrigatória por item, mas o **valor aceita `null`** (sem papel específico naquele
sistema — mesmo default do link único via `POST`); deduplica por `system_id`; valida cada sistema
(404 `SYSTEM_NOT_FOUND`). Resposta: a lista resultante `[{ system_id, role }]`.

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
| `GET` | `/systems/:systemId/users/:userId/access-logs` | `access-logs:read` |
| `GET` | `/access-logs/stats` | `access-logs:read` |
| `GET` | `/access-logs/wrong-password` | `access-logs:read` |
| `GET` | `/access-logs/today` | `access-logs:read` |

**`GET /systems/:systemId/access-logs`** — logs de um sistema (todos os usuários). Filtros: só
`page`, `perPage` (sem filtro por sucesso/período/usuário — ver `/access-logs/stats` para agregação).
Valida sistema (404 `SYSTEM_NOT_FOUND`).

**`GET /users/:userId/access-logs`** — logs de um usuário (todos os sistemas). Filtros: só `page`,
`perPage`. Valida usuário (404 `USER_NOT_FOUND`). Alimenta o card "Últimos N Acessos".

**`GET /systems/:systemId/users/:userId/access-logs`** — logs de **um usuário em um sistema
específico** (recorte do anterior). Filtros: só `page`, `perPage`. Valida sistema (404
`SYSTEM_NOT_FOUND`) e usuário (404 `USER_NOT_FOUND`). Mesmo shape de item das demais.

Ambos ordenados por `accessed_at` desc. Item:
```json
{
  "id": "10482",
  "systems_users_id": 12,
  "user_id": 10,
  "system_id": 2,
  "success": true,
  "wrong_password": false,
  "accessed_at": "2026-06-22T13:45:00.000Z"
}
```
- `success` — `true` também em tentativas com **senha errada** (que carregam `wrong_password=true`);
  `false` só em conta inativa. Login efetivo = `success=true` **e** `wrong_password` falso/nulo.
- `wrong_password` — `boolean | null`: `true` = senha incorreta; `null` em registros antigos
  (anteriores à criação da coluna).

### `GET /access-logs/stats` — agregado por dia

Alimenta um gráfico de barras empilhadas (sucesso × falha) por dia. Única rota do módulo **não**
aninhada em `:systemId`/`:userId` — por padrão agrega **todos** os sistemas.

**Query:**

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `days` | int (1–90) | não | Últimos N dias incluindo hoje. Default **7** se nenhum filtro de período vier |
| `from` / `to` | `YYYY-MM-DD` | não (mas juntos) | Range explícito, alternativa a `days` |
| `system_id` | int | não | Restringe a 1 sistema |
| `bu_id` | int | não | Restringe aos sistemas vinculados a essa BU. BU sem sistema vinculado → resposta zerada |
| `user_id` | int | não | Escopa o agregado a **1 usuário**. Ortogonal a `system_id`/`bu_id` (combina com qualquer um). Com ele, `by_system` = "frequência por sistema **daquele usuário**" e `unique_users` fica 0/1 |

Combinações inválidas (código próprio, não `VALIDATION_ERROR` genérico):

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `CONFLICTING_FILTERS` | `system_id` + `bu_id` juntos |
| 400 | `CONFLICTING_RANGE` | `days` junto com `from`/`to` |
| 400 | `INCOMPLETE_RANGE` | só `from` ou só `to` |
| 400 | `INVALID_RANGE` | `from` > `to` |

**`200`:**
```json
{
  "data": {
    "range": { "from": "2026-06-30", "to": "2026-07-06", "days": 7 },
    "unique_users": 22,
    "buckets": [
      { "date": "2026-06-30", "success": 24, "fail": 0, "wrong_password": 0 },
      { "date": "2026-07-06", "success": 19, "fail": 3, "wrong_password": 2 }
    ],
    "by_system": [
      { "system_id": 3, "success": 14, "fail": 1 },
      { "system_id": 7, "success": 10, "fail": 0 }
    ]
  }
}
```
`buckets` cobre **todo** dia do range (zero-fill nos dias sem acesso), do mais antigo pro mais
recente. `unique_users` = usuários distintos no mesmo range/filtro. Datas do bucket já estão no
fuso `America/Sao_Paulo` (não UTC).

> Em `buckets` e `by_system`, **`success` = login real** (`success=true` **e** `wrong_password`
> falso/nulo). Tentativas com senha errada entram em **`fail`**, não em `success` — então o KPI de
> acessos não é inflado por senhas erradas. `unique_users` conta qualquer tentativa logada.

Cada item de `buckets` traz três contagens do dia: `success` (logins reais), `fail` (tudo que não é
login real) e **`wrong_password`** (acessos com `wrong_password=true`). **`wrong_password` é um
subconjunto de `fail`** (`wrong_password ≤ fail`) — serve pra pintar uma 3ª cor **dentro** da barra
de falha, não uma barra separada somada por cima. ⚠️ Note que isso vale para o **agregado do stats**:
no **log cru** (`GET .../access-logs`), uma tentativa de senha errada aparece com `success=true` +
`wrong_password=true` (mudança recente) — não filtre o log cru por `success=false` esperando achar
senhas erradas. O `by_system` **não** ganhou esse recorte.

**`by_system`** — breakdown de logins **por sistema** no range consultado, para o card "Sistema Mais
Acessado" resolver tudo numa chamada só (em vez de uma por sistema):
- **Só existe quando `system_id` NÃO é enviado.** Com `system_id`, a resposta é a de hoje, **sem**
  este campo (seria um sistema só).
- Cada item: `{ system_id, success, fail }` — `success` é o total de logins bem-sucedidos e `fail`
  as tentativas falhas do sistema no range (o card usa só `success`; `fail` vem de brinde).
- **Ordenado por `success` desc** → o **1º item é o sistema mais acessado** do range.
- **Sem zero-fill** (≠ `buckets`): sistema sem nenhum acesso no range **não aparece** no array.
- Respeita `bu_id`: filtrando por BU, o array traz só os sistemas vinculados a ela (o join
  `systems_bus` é feito internamente pela API).
- A presença do campo depende só de `system_id` ter sido omitido, não de haver dados: sem
  `system_id` e sem nenhum acesso no range, vem `by_system: []`.

### `GET /access-logs/wrong-password` — usuários que erraram a senha

Lista os usuários que tiveram tentativa(s) com **senha errada** no range, **agregados por usuário**,
para o card "quem errou a senha hoje" numa **única** chamada (sem varrer logs por sistema nem cruzar
`/users`).

**Query** — **mesmo contrato do `/access-logs/stats`** (`days`, `from`/`to`, `system_id`, `bu_id`,
com os mesmos erros de combinação `CONFLICTING_FILTERS` / `CONFLICTING_RANGE` / `INCOMPLETE_RANGE` /
`INVALID_RANGE`). **Única diferença:** sem filtro de período, o default é **hoje** (1 dia), não 7.

**`200`** — array (não paginado), um objeto por usuário, ordenado por `attempts` desc (empate:
`last_attempt_at` desc):
```json
{
  "data": [
    { "user_id": 10, "name": "Fulano", "email": "f@x.com", "attempts": 3, "last_attempt_at": "2026-07-07T14:20:00.000Z" },
    { "user_id": 22, "name": "Ciclana", "email": "c@x.com", "attempts": 1, "last_attempt_at": "2026-07-07T09:05:00.000Z" }
  ]
}
```
- Cada item traz `user_id`, `name`, `email` (já resolvidos), `attempts` (nº de tentativas com senha
  errada no range) e `last_attempt_at` (a mais recente).
- **Agregado por usuário**, não por sistema: quem errou em vários sistemas soma tudo num item só.
  `system_id`/`bu_id` restringem **quais** tentativas contam.
- **Sem zero-fill:** só aparecem usuários com ≥1 erro de senha; range/filtro sem erros → `data: []`.

### `GET /access-logs/today` — acessos de hoje (lista individual)

Lista **individual** (não agregada) de **todos os acessos de hoje** (fuso `America/Sao_Paulo`), todos
os sistemas, ordenada por `accessed_at` desc. **Sem paginação.** Nomes não vêm resolvidos (o front
cruza com o que já tem carregado).

**Query:** só **`bu_id`** (opcional) — restringe aos sistemas vinculados à BU. **Sem** `days`/`from`/
`to` (é sempre hoje) e **sem** `system_id` (é sempre todos). BU sem sistema vinculado → `data: []`.

**`200`** — array (não paginado), `accessed_at` desc:
```json
{
  "data": [
    { "user_id": 10, "system_id": 3, "accessed_at": "2026-07-07T14:20:00.000Z", "success": true, "wrong_password": false }
  ]
}
```
- `success`/`wrong_password` são os valores **crus** do log — lembre que senha errada vem como
  `success: true` + `wrong_password: true` (não filtre por `success === false` esperando achar senha
  errada; filtre por `wrong_password === true`).

---

## 6.14 Clients — scopes `clients:read` / `clients:write`

Clientes da 3F. Recurso **migrado em 2026-07** da plataforma de contratos (`sistema_gestao.clients`)
para a Core, porque quase todos os sistemas internos passaram a precisar consumir dados de cliente.
A Core guarda a **identidade** do cliente; o que é específico de um sistema fica no overlay local
dele (no sistema de gestão: `client_settings` → `contact_id`, `is_delinquent`, `squad_id_manual`).
Os **IDs foram preservados** na migração, então `client_id` das tabelas locais continua válido.

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/clients` | `clients:read` |
| `GET` | `/clients/search` | `clients:read` |
| `GET` | `/clients/by-document/:document` | `clients:read` |
| `GET` | `/clients/:id` | `clients:read` |
| `POST` | `/clients/batch` | **`clients:read`** (leitura em lote) |
| `POST` | `/clients/assign-specialist` | `clients:write` (escrita em lote) |
| `POST` | `/clients` | `clients:write` |
| `PATCH` | `/clients/:id` | `clients:write` |
| `GET` | `/squads/:squadId/clients` | `clients:read` |
| `GET` | `/users/:userId/clients` | `clients:read` |

> ⚠️ **Não existe `DELETE /clients/:id`.** Churn é histórico financeiro: `contract_churns.client_id`
> e `spiced.client_id` (no banco do sistema de gestão) referenciam o cliente **sem FK real** —
> Postgres não faz FK entre bancos —, então apagar aqui deixaria registros órfãos em silêncio. Para
> desativar: `PATCH { "is_active": false }`.

### ⚠️ `status` ≠ `is_active` — leia antes de filtrar

- **`status`** = ciclo de vida **comercial** (5 valores, tabela abaixo). É o que a regra de negócio
  consulta.
- **`is_active`** = soft-delete do registro (convenção da Core). Um cliente em churn é um registro
  **válido**, com `is_active = true`.

> **Filtrar `?is_active=true` esperando "clientes ativos" traz os churns junto.** Para negócio, use
> `status` no seu lado.

### Valores de `status`

| Valor | Significado |
|---|---|
| `active` | Cliente ativo (**default** ao criar) |
| `aguardando_renovacao` | Contrato perto do vencimento, em negociação de renovação |
| `em_cancelamento` | Aviso prévio em curso (janela padrão de 30 dias) |
| `churn` | Encerramento efetivado — saída comercial |
| `cancelado` | Anulação administrativa — trilha **separada** do churn (registro criado por engano, contrato anulado, duplicidade) |

> **`cancelado` não é `churn`.** Não some os dois em métrica de churn: `cancelado` é correção de
> cadastro, não saída comercial.
>
> Valor fora dessa lista → `400 VALIDATION_ERROR`. `aguardando_renovacao` e `cancelado` foram
> liberados em **2026-07-30**; antes disso só existiam os outros três.

**`GET /clients`** — lista paginada. Query: `page`, `perPage`, `is_active`. Ordenada por `name` asc.
Cada item vem **sem `logo_picture`** (ver nota de imagens abaixo). Item:
```json
{
  "id": 12, "type": "pj", "name": "Acme LTDA", "common_name": "Acme", "document": "12345678000190",
  "email": "contato@acme.com", "phone": "11912345678", "instagram": "@acme",
  "cep": "01310-100", "logradouro": "Av. Paulista", "numero": "1000", "complement": null,
  "bairro": "Bela Vista", "cidade": "São Paulo", "uf": "SP",
  "representative_name": "Fulano", "representative_cpf": "12345678900",
  "representative_email": "fulano@acme.com",
  "status": "active", "squad_id": 3, "specialist_id": null, "is_active": true,
  "created_by": null, "created_at": "2026-06-22T13:45:00.000Z", "updated_at": "2026-06-22T13:45:00.000Z"
}
```

> **Filtros que são ROTA, não query param** (convenção desta API — filtro explícito é descobrível
> pelo contrato): recorte por squad → `GET /squads/:squadId/clients`; por especialista →
> `GET /users/:userId/clients`; busca textual → `GET /clients/search?q=`. **`status` ainda não é
> filtrável** por nenhum dos dois caminhos — se precisar, peça a rota.

**`GET /clients/search`** — busca paginada por `name` **ou** `document` (case-insensitive, substring).
Query: `q` (**obrigatório**, 1–150 chars) + `page`, `perPage`. Mesmo shape de item do `GET /clients`
(sem `logo_picture`).

**`GET /clients/by-document/:document`** — lookup pela **chave natural** (`document` é `UNIQUE`).
Item único, **com** `logo_picture`. 404 `CLIENT_NOT_FOUND`.

> ⚠️ **O match é exato e os documentos estão gravados SEM pontuação** (só dígitos — CPF 11, CNPJ 14).
> Mandar `00.000.000/0001-00` devolve **404**: normalize para dígitos antes de chamar. (A API não
> normaliza hoje, nem na leitura nem na escrita.)

**`GET /clients/:id`** — item único, **com** `logo_picture`. 404 `CLIENT_NOT_FOUND`.

**`POST /clients/batch`** → `200`. **O endpoint que mata o N+1**: hidrata vários clientes por id numa
única chamada (ex.: uma página de contratos → colete os `client_id` distintos → **um** batch → monte
um `Map` e hidrate em memória). É `POST` só porque o array de ids vai no body; semanticamente é
leitura, por isso o scope é **`clients:read`**. Body:
```json
{ "ids": [12, 40, 291] }
```
| Campo | Tipo | Regra |
|---|---|---|
| `ids` | int[] | obrigatório, **1 a 200** ids positivos; duplicados são ignorados |

Resposta: **array** (item único, **não paginado**), ordenado por `id` asc, **sem `logo_picture`**:
```json
{ "data": [ { "id": 12, "name": "Acme LTDA", "...": "..." } ] }
```
- **Ids inexistentes são omitidos, não geram erro** (mesma semântica de `GET /users/photos`): um id
  ausente não deve derrubar a página inteira de contratos. Compare o tamanho do array com o que pediu
  se precisar detectar faltantes.
- **Uma chamada por página, nunca uma por item.** Se aparecer chamada dentro de loop, está errado.

**`POST /clients/assign-specialist`** → `200`. **Atribuição de especialista em LOTE** (a "carteira do
especialista"): vincula/desvincula **um** especialista a **vários** clientes numa única chamada. É o
batch do `PATCH /clients/:id { specialist_id }` — existe porque a tela de carteira reatribui N clientes
de uma vez, e fazer isso 1-a-1 estouraria o rate limit (~100/min). Scope **`clients:write`**. Body:
```json
{ "specialist_id": 42, "client_ids": [12, 40, 291] }
```
| Campo | Tipo | Regra |
|---|---|---|
| `specialist_id` | int \| null | **obrigatório**. `user.id` da Core (404 `SPECIALIST_NOT_FOUND` se enviado e inexistente). **`null` DESVINCULA** todos os `client_ids` (sem validação) |
| `client_ids` | int[] | obrigatório, **1 a 200** ids positivos; duplicados são ignorados |

Resposta:
```json
{ "data": { "specialist_id": 42, "updated": [12, 40, 291], "skipped": [], "count": 3 } }
```
- **`updated`** — ids que **existiam e receberam o `UPDATE`** (ordenados). É **idempotente**: reatribuir
  para o mesmo especialista **ainda devolve o id em `updated`** — o array significa *"gravado"*, **não**
  *"valor mudou"*. `count` = tamanho de `updated`.
- **`skipped`** — ids do `client_ids` que **não existem** (ordenados). Mesma tolerância do
  `POST /clients/batch`: id inexistente **não** derruba o lote nem gera erro — só não é gravado.
- **Grava por id, independentemente de `is_active`/`status`** — o chamador manda a lista explícita da
  própria tela. `specialist_id: null` limpa a carteira dos ids enviados.
- ⚠️ **Valida apenas "é `user`", não "é especialista".** `specialist_id` só precisa existir na tabela
  `user`; a Core **não** verifica se aquele usuário tem o cargo "Especialista" — é de propósito, mantém
  a Core genérica. Garantir que o id é de um especialista real é responsabilidade de quem chama.

**`POST /clients`** → `201`. Body:

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `type` | enum | ✅ | `pf` ou `pj` (**minúsculo**) |
| `name` | string | ✅ | 1–200 |
| `common_name` | string | — | ≤150. Nome comum/usual do cliente, distinto de `name` (razão social) |
| `document` | string | ✅ | 1–30, **único** (409 se repetir). Envie só dígitos |
| `status` | enum | — | Um dos **5** valores da tabela de `status` acima (default no banco: `active`) |
| `email` | string | — | e-mail válido, ≤150 |
| `phone` | string | — | ≤30 |
| `instagram` | string | — | ≤200 |
| `cep` | string | — | ≤9 |
| `logradouro` | string | — | ≤200 |
| `numero` | string | — | ≤100 (texto livre) |
| `complement` | string | — | ≤200 |
| `bairro` | string | — | ≤100 |
| `cidade` | string | — | ≤100 |
| `uf` | string | — | ≤2, normalizado p/ maiúsculo |
| `representative_name` | string | — | ≤200 |
| `representative_cpf` | string | — | ≤14 |
| `representative_email` | string | — | e-mail válido, ≤150 |
| `squad_id` | int | — | FK → `squad` (404 `SQUAD_NOT_FOUND` se enviado e inexistente). Aceita `null` |
| `specialist_id` | int | — | FK → `user` (404 `SPECIALIST_NOT_FOUND`). Aceita `null` |
| `logo_picture` | string | — | Caminho / base64 |
| `is_active` | bool | — | default no banco = `true` |
| `created_by` | int | — | FK → `user` (404 `CREATED_BY_NOT_FOUND`). **Opcional de verdade** neste recurso |

> ⚠️ `created_by` aqui é **opcional**, diferente de `departments`/`positions`/`bands`/`api-keys`,
> onde a regra de negócio exige.
>
> ⚠️ `type` é **minúsculo** (`'pj'`) nesta API. O sistema de gestão usa `'PJ'` maiúsculo em
> `contracts_templates.person_type` — inconsistência conhecida e mantida; converta no seu lado.

**`PATCH /clients/:id`** — atualização **parcial** (todos os campos acima, exceto `created_by`, que
não é alterável após a criação). `squad_id`/`specialist_id` aceitam `null` para limpar o vínculo, e
são validados quando enviados com valor. Id inexistente → `404 NOT_FOUND` (**código genérico**, não
`CLIENT_NOT_FOUND` — igual aos outros recursos CRUD desta API).

**`GET /squads/:squadId/clients`** — clientes de um squad (via `client.squad_id`), paginado, sem
`logo_picture`. Valida o squad (404 `SQUAD_NOT_FOUND`).

**`GET /users/:userId/clients`** — clientes atendidos por um usuário como **especialista** (via
`client.specialist_id`), paginado, sem `logo_picture`. Valida o usuário (404 `SPECIALIST_NOT_FOUND`).

> **`specialist_id` está NULL em 100% dos clientes hoje** (na origem os únicos valores apontavam para
> devs, não para especialistas reais, e foram descartados de propósito). Esta rota devolve lista
> vazia até a atribuição começar a ser usada. Para atribuir, use `POST /clients/assign-specialist`
> (lote — recomendado para a tela de carteira) ou `PATCH /clients/:id { specialist_id }` (1-a-1).
> Grave o **`user.id` da Core** — não o id de usuário/seller do seu sistema.

### Imagens (`logo_picture`)

`logo_picture` **só** vem em `GET /clients/:id` e `GET /clients/by-document/:document`. Está fora de
`GET /clients`, `/clients/search`, `/clients/batch` e das duas rotas aninhadas — mesmo motivo do
`profile_picture` de usuário: o formato previsto é base64 inline, que arrastaria a imagem inteira por
registro. Hoje a coluna está **vazia em todos os registros**, então a omissão é preventiva; o contrato
já nasce certo. O plano acordado é migrar para caminho em object storage/CDN — troca de conteúdo, sem
mudar o contrato.

### Erros

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `type`/`status` fora do enum, `document`/`name` ausentes, `ids`/`client_ids` vazio ou > 200, `specialist_id` ausente no assign, `q` ausente |
| 404 | `CLIENT_NOT_FOUND` | `id`/`document` inexistente em `GET /clients/:id` e `GET /clients/by-document/:document` |
| 404 | `NOT_FOUND` | **`PATCH` de id inexistente** — código genérico, não `CLIENT_NOT_FOUND` |
| 404 | `SQUAD_NOT_FOUND` | `squad_id` inexistente (create/update) ou `:squadId` inexistente |
| 404 | `SPECIALIST_NOT_FOUND` | `specialist_id` inexistente (create/update/assign) ou `:userId` inexistente |
| 404 | `CREATED_BY_NOT_FOUND` | `created_by` inexistente no create |
| 409 | `CONFLICT` | `document` duplicado (`details.target` inclui `document`) |

### ⚠️ Efeito colateral em `DELETE` de squads e usuários

As FKs de `client` são **`ON DELETE NO ACTION`** (assimetria com o resto da Core, onde são
`SET NULL`/`CASCADE`). `NO ACTION` **bloqueia** a exclusão do pai em vez de anular o filho:

- **`DELETE /squads/:id`** → **`409 FK_CONSTRAINT`** se o squad tiver clientes vinculados. **Já
  acontece hoje** (15 dos 293 clientes têm `squad_id`).
- **`DELETE /users/:id`** → **`409 FK_CONSTRAINT`** se o usuário for `specialist_id` ou `created_by`
  de algum cliente. Não ocorre hoje (colunas NULL), mas passará a ocorrer quando forem usadas.

Para excluir nesses casos, primeiro desvincule os clientes (`PATCH /clients/:id` com `squad_id: null`
/ `specialist_id: null`).

---

## 7. Resumo de todos os endpoints

| Método | Rota | Scope |
|---|---|---|
| `GET` | `/health`, `/health/ready` | *(sem auth)* |
| `POST` | `/auth/validate` | `auth:validate` |
| `GET` | `/users` · `/users/photos` · `/users/:id` · `/users/:id/led` | `users:read` |
| `POST` | `/users` · `/users/:id/reset-password` (**`admin:*`**) | `users:write` |
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
| `GET` | `/squads/:id/users` · `/squads/:id/members` | `users:read` |
| `POST` | `/squads` | `squads:write` |
| `PATCH` | `/squads/:id` | `squads:write` |
| `DELETE` | `/squads/:id` | `squads:delete` |
| `GET/POST/PATCH/DELETE` | `/departments[/:id]` | `departments:{read,write,delete}` |
| `GET/POST/PATCH/DELETE` | `/positions[/:id]` | `positions:{read,write,delete}` |
| `GET/POST/PATCH/DELETE` | `/bands[/:id]` | `bands:{read,write,delete}` |
| `GET` | `/systems` · `/systems/with-bus` · `/systems/:id` | `systems:read` |
| `POST/PATCH/DELETE` | `/systems[/:id]` | `systems:{write,delete}` |
| `GET` | `/systems/:systemId/users` · `/users/:userId/systems` | `systems-users:read` |
| `POST` | `/systems/:systemId/users` · `/systems/:systemId/users/batch` | `systems-users:write` |
| `PUT` | `/users/:userId/systems` | `systems-users:write` |
| `DELETE` | `/systems/:systemId/users/batch` · `/systems/:systemId/users/:userId` | `systems-users:delete` |
| `GET` | `/systems/:systemId/bus` · `/bus/:buId/systems` | `systems-bus:read` |
| `POST` | `/systems/:systemId/bus` | `systems-bus:write` |
| `PUT` | `/systems/:systemId/bus` | `systems-bus:write` |
| `DELETE` | `/systems/:systemId/bus/:buId` | `systems-bus:delete` |
| `GET` | `/systems/:systemId/access-logs` · `/users/:userId/access-logs` · `/systems/:systemId/users/:userId/access-logs` · `/access-logs/stats` · `/access-logs/wrong-password` · `/access-logs/today` | `access-logs:read` |
| `GET` | `/clients` · `/clients/search` · `/clients/by-document/:document` · `/clients/:id` · `/squads/:squadId/clients` · `/users/:userId/clients` | `clients:read` |
| `POST` | `/clients/batch` *(leitura em lote)* | `clients:read` |
| `POST` | `/clients` · `/clients/assign-specialist` *(escrita em lote)* | `clients:write` |
| `PATCH` | `/clients/:id` | `clients:write` |
| `DELETE` | *(`/clients/:id` **não existe** — use `PATCH { is_active: false }`)* | — |
