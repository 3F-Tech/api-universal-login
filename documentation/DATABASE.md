# DATABASE.md — 3F Core API

Estrutura completa do banco de dados da **3F Core API** (`api-universal-login`), a base de
identidade centralizada da 3F Venture. Este documento é a **referência de schema** para qualquer
sistema/IA que vá integrar com esta API.

- **SGBD:** PostgreSQL
- **Fonte da verdade:** o **banco** (o schema do Prisma é *introspectado*, nunca escrito à mão).
- **Convenção de nomes:** tabelas e colunas em `snake_case`.
- **Timestamps:** `created_at` / `updated_at` são `timestamptz` (UTC). **`updated_at` é atualizado por
  trigger no banco** (`trg_<tabela>_updated_at` → `update_updated_at_column()`), em **todas** as
  tabelas que têm a coluna. A API **não** grava esse campo — depende do trigger.
  > ⚠️ Até 2026-07-30 este documento afirmava o oposto ("não é atualizado por trigger — quem grava é a
  > API"). Era **falso** e causou dano real: a tabela `client` nasceu **sem** o trigger e ninguém notou,
  > então `client.updated_at` ficou congelado no valor de criação. Isso invalidou uma tentativa de
  > detectar registros editados por `updated_at` durante a migração de clientes. O trigger foi criado
  > em 2026-07-30 (`trg_client_updated_at`). **Ao criar tabela nova, crie o trigger** — não assuma que
  > a API cuida disso.
- **Chaves primárias:** `id` `integer` autoincremento (serial), salvo onde indicado
  (`systems_users_access.id` é **BigInt**; `systems_bus` usa PK composta).

> ⚠️ **Importante para integradores:** esta API é **backend-to-backend**. Você **não** acessa o banco
> diretamente — todo acesso é via HTTP autenticado por `X-API-Key`. Este documento existe para você
> entender o **modelo de dados** por trás dos endpoints (campos, tipos, relações, o que é
> obrigatório/único/nullable). Para os contratos HTTP, veja os demais `.md` desta pasta.

---

## Índice de tabelas

| Tabela | Papel | PK |
|---|---|---|
| [`user`](#tabela-user) | Identidade central de pessoas | `id` |
| [`bu`](#tabela-bu) | Business Units (árvore hierárquica) | `id` |
| [`squad`](#tabela-squad) | Squads / times | `id` |
| [`department`](#tabela-department) | Departamentos | `id` |
| [`position`](#tabela-position) | Cargos | `id` |
| [`band`](#tabela-band) | Bands / faixas salariais | `id` |
| [`system`](#tabela-system) | Catálogo de sistemas consumidores | `id` |
| [`api_key`](#tabela-api_key) | API Keys de acesso à API | `id` |
| [`systems_users`](#tabela-systems_users) | Vínculo N:N user ↔ system (+ role) | `id` |
| [`systems_users_access`](#tabela-systems_users_access) | Log de acessos / tentativas de login | `id` (BigInt) |
| [`systems_bus`](#tabela-systems_bus) | Vínculo N:N system ↔ bu | `(system_id, bu_id)` |
| [`users_bus`](#tabela-users_bus) | Vínculo N:N user ↔ bu | `id` |
| [`client`](#tabela-client) | Clientes (migrado do sistema de gestão de contratos) | `id` (BigInt) |

### Mapa de relacionamentos (resumo)

```
system ─┬──< api_key            (system_id, CASCADE)
        ├──< systems_users >──── user        (N:N, role por sistema)
        └──< systems_bus  >──── bu           (N:N)

user ───┬──< users_bus >─────── bu           (N:N, from_squad)
        ├──> department         (department_id)
        ├──> position           (position_id)
        ├──> band               (band_id)
        ├──> squad              (squad_id)
        └──> user               (leader_id → id, auto-referência: líder direto)

bu ─────── bu                   (parent_id → árvore)
squad ──┬──> bu                 (bu_id)
        └──> user               (leader_id)

systems_users ──< systems_users_access   (systems_users_id, CASCADE)

client ─┬──> squad              (squad_id, sem CASCADE)
        ├──> user               (specialist_id, sem CASCADE)
        └──> user               (created_by, sem CASCADE)

# created_by aponta para user em: api_key, band, department, position, client
```

---

## Tabela `user`

Recurso central de identidade. Guarda dados pessoais, de contato, endereço e os vínculos de perfil
(departamento, cargo, band, squad). A senha é armazenada como **hash bcrypt**.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `name` | `varchar(150)` | não | — | Nome completo |
| `email` | `varchar(150)` | não | — | **UNIQUE**. E-mail corporativo (login) |
| `personal_email` | `varchar(150)` | sim | — | E-mail pessoal |
| `password` | `varchar(60)` | não | — | **Hash bcrypt** — 🔒 nunca retornado pela API |
| `birth_date` | `date` | sim | — | Data de nascimento |
| `cpf` | `varchar(14)` | sim | — | **UNIQUE**. Formato com máscara (`000.000.000-00`) |
| `cnpj` | `varchar(18)` | sim | — | **UNIQUE**. Formato com máscara |
| `sex` | `varchar(10)` | sim | — | |
| `phone` | `varchar(20)` | sim | — | |
| `instagram` | `varchar(100)` | sim | — | |
| `linkedin` | `varchar(200)` | sim | — | |
| `role` | `varchar(50)` | não | — | Papel/role global do usuário (texto livre) |
| `department_id` | `int4` | sim | — | **FK** → `department.id` |
| `position_id` | `int4` | sim | — | **FK** → `position.id` |
| `band_id` | `int4` | sim | — | **FK** → `band.id` |
| `squad_id` | `int4` | sim | — | **FK** → `squad.id` |
| `leader_id` | `int4` | sim | — | **FK** → `user.id` (**auto-referência**). Líder direto deste usuário |
| `profile_picture` | `text` | sim | — | URL / caminho da foto / base64 |
| `contract_link` | `varchar(500)` | sim | — | Link do contrato (ex.: Google Drive). **Sem relação** com nenhuma outra tabela |
| `contract_base64` | `text` | sim | — | Base64 do contrato. **Sem relação** com nenhuma outra tabela. Mesmo padrão de omissão em listagem que `profile_picture` (ver `API.md`) |
| `cep` | `varchar(9)` | sim | — | |
| `street` | `varchar(200)` | sim | — | |
| `street_number` | `varchar(20)` | sim | — | |
| `neighborhood` | `varchar(100)` | sim | — | |
| `complement` | `varchar(200)` | sim | — | |
| `city` | `varchar(100)` | sim | — | |
| `state` | `varchar(50)` | sim | — | |
| `country` | `varchar(50)` | sim | — | |
| `is_active` | `boolean` | não | `true` | Soft-disable (independente de exclusão) |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |

**Índices:** `email`, `cpf`, `department_id`, `squad_id`, `is_active`, `leader_id`.

**Relações:** vínculos N:N com `bu` (via `users_bus`) e com `system` (via `systems_users`). Também é
referenciado como `created_by` em `api_key`, `band`, `department`, `position`, e como `leader_id` em
`squad` **e em si mesmo** (`user.leader_id` → `user.id`, auto-referência: o líder direto de um
usuário na hierarquia).

---

## Tabela `bu`

Business Units. Suporta hierarquia (árvore) via `parent_id` apontando para outra `bu`.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `name` | `varchar(100)` | não | — | |
| `description` | `text` | sim | — | |
| `slug` | `varchar(100)` | não | — | **UNIQUE**. Identificador legível |
| `primary_color_hex` | `varchar(7)` | sim | — | Cor (`#RRGGBB`) |
| `secondary_color_hex` | `varchar(7)` | sim | — | Cor (`#RRGGBB`) |
| `parent_id` | `int4` | sim | — | **FK** → `bu.id` (BU pai; raiz = `null`) |
| `logo_picture` | `text` | sim | — | URL / caminho do logo |
| `is_active` | `boolean` | não | `true` | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |

**Índices:** `slug`, `parent_id`.

**Relações:** filhos via auto-relação (`parent_id`); N:N com `system` (`systems_bus`) e `user`
(`users_bus`); referenciada por `squad.bu_id`.

---

## Tabela `squad`

Squads / times. Liderado por um `user` (`leader_id`) e opcionalmente vinculado a uma `bu`.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `name` | `varchar(150)` | não | — | |
| `description` | `text` | sim | — | |
| `picture` | `text` | sim | — | URL / caminho |
| `leader_id` | `int4` | sim | — | **FK** → `user.id`. Nullable no banco, mas **exigido no create** pela API |
| `bu_id` | `int4` | sim | — | **FK** → `bu.id` |
| `is_active` | `boolean` | não | `true` | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |

**Índices:** `bu_id`, `leader_id`.

**Relações:** referenciada por `user.squad_id` (membros do squad).

---

## Tabela `department`

Departamentos.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `name` | `varchar(100)` | não | — | |
| `icon` | `varchar(100)` | sim | — | |
| `is_active` | `boolean` | não | `true` | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |
| `created_by` | `int4` | sim | — | **FK** → `user.id`. Nullable no banco, **exigido no create** pela API |

**Relações:** referenciada por `user.department_id`.

---

## Tabela `position`

Cargos. ⚠️ `position` é palavra reservada em SQL — sempre tratada com aspas no banco.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `name` | `varchar(100)` | não | — | |
| `is_active` | `boolean` | não | `true` | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |
| `created_by` | `int4` | sim | — | **FK** → `user.id`. Nullable no banco, **exigido no create** pela API |

**Relações:** referenciada por `user.position_id`.

---

## Tabela `band`

Bands / faixas. Tem suporte a apresentação visual (`color_hex`, `icon`, `sort_order`).

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `name` | `varchar(100)` | não | — | |
| `color_hex` | `varchar(7)` | sim | — | Cor (`#RRGGBB`) |
| `sort_order` | `int4` | não | `0` | Ordem de exibição |
| `is_active` | `boolean` | não | `true` | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |
| `created_by` | `int4` | sim | — | **FK** → `user.id`. Nullable no banco, **exigido no create** pela API |
| `icon` | `varchar(100)` | sim | — | |

**Relações:** referenciada por `user.band_id`.

---

## Tabela `system`

Catálogo dos sistemas consumidores da API (cada sistema possui suas próprias API Keys e vínculos).

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `name` | `varchar(150)` | não | — | |
| `description` | `text` | sim | — | |
| `link` | `varchar(500)` | sim | — | URL do sistema |
| `logo_picture` | `text` | sim | — | URL / caminho do logo |
| `is_active` | `boolean` | não | `true` | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |

**Relações:** possui muitas `api_key`; N:N com `user` (`systems_users`) e `bu` (`systems_bus`).

---

## Tabela `api_key`

Credenciais de acesso à API. Cada key pertence a um `system` e carrega um conjunto de `scopes`.
A chave em si **nunca** é armazenada — guarda-se apenas o **hash** e um **prefixo** para exibição.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `system_id` | `int4` | não | — | **FK** → `system.id` (**ON DELETE CASCADE**) |
| `name` | `varchar(150)` | não | — | Nome/descrição da key |
| `key_hash` | `varchar(255)` | não | — | **UNIQUE**. Hash da chave — 🔒 nunca retornado |
| `key_prefix` | `varchar(12)` | não | — | Prefixo público (ex.: para identificar a key na UI) |
| `scopes` | `text[]` | não | `[]` | Array de scopes de autorização |
| `last_used_at` | `timestamptz` | sim | — | Último uso registrado |
| `expires_at` | `timestamptz` | sim | — | Expiração (null = não expira) |
| `is_active` | `boolean` | não | `true` | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | |
| `created_by` | `int4` | sim | — | **FK** → `user.id`. Quem criou a key |

**Índices:** `is_active`, `key_hash`, `system_id`.

> A chave crua é exibida **uma única vez** no momento da criação (*show-once*). Depois disso só
> existe o hash. Tipos de key (`adm`, `login`) e seus scopes são definidos pela API, não pelo banco.

---

## Tabela `systems_users`

Vínculo N:N entre `user` e `system`, com um `role` específico por sistema. É o que define **quais
usuários podem acessar quais sistemas** e em qual papel.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `system_id` | `int4` | não | — | **FK** → `system.id` (**ON DELETE CASCADE**) |
| `user_id` | `int4` | não | — | **FK** → `user.id` (**ON DELETE CASCADE**) |
| `role` | `varchar(50)` | sim | — | Papel do usuário **naquele** sistema |
| `created_at` | `timestamptz` | não | `now()` | |

**Restrições:** **UNIQUE** `(system_id, user_id)` — um usuário só tem um vínculo por sistema.
**Índices:** `system_id`, `user_id`, `role`.

**Relações:** possui muitos `systems_users_access` (histórico de acessos).

---

## Tabela `systems_users_access`

Log de acessos / tentativas de login de um usuário em um sistema. ⚠️ A PK é **BigInt** — ao
serializar para JSON, converta com `.toString()`.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `bigserial` (int8) | não | autoincremento | **PK** — **BigInt** |
| `systems_users_id` | `int4` | não | — | **FK** → `systems_users.id` (**ON DELETE CASCADE**) |
| `accessed_at` | `timestamptz` | não | `now()` | |
| `success` | `boolean` | não | — | `true` = tentativa legítima (login válido **ou** senha errada); `false` = conta inativa |
| `wrong_password` | `boolean` | sim | — | `true` = senha incorreta; `false` = senha ok / não aplicável; `null` em registros antigos |

**Índices:** `accessed_at` (DESC), `systems_users_id`.

> Registrado pelo fluxo de `POST /auth/validate`: sucesso → `success=true`, `wrong_password=false`;
> **senha errada** (com vínculo) → `success=true`, `wrong_password=true`; conta inativa (com vínculo)
> → `success=false`. Casos sem vínculo / user inexistente **não** geram log. **Login efetivo** =
> `success=true AND NOT wrong_password` (é como o `/access-logs/stats` conta acessos).

---

## Tabela `systems_bus`

Vínculo N:N entre `system` e `bu`. **Tabela de junção pura** — não tem `id` próprio; a PK é composta.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `system_id` | `int4` | não | — | **FK** → `system.id` (**ON DELETE CASCADE**). Parte da **PK** |
| `bu_id` | `int4` | não | — | **FK** → `bu.id` (**ON DELETE CASCADE**). Parte da **PK** |

**Restrições:** **PK composta** `(system_id, bu_id)`.

---

## Tabela `users_bus`

Vínculo N:N entre `user` e `bu`. Indica a quais Business Units um usuário pertence.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `serial` (int4) | não | autoincremento | **PK** |
| `user_id` | `int4` | não | — | **FK** → `user.id` (**ON DELETE CASCADE**) |
| `bu_id` | `int4` | não | — | **FK** → `bu.id` (**ON DELETE CASCADE**) |
| `from_squad` | `boolean` | não | `false` | Indica se o vínculo foi derivado do squad do usuário |
| `created_at` | `timestamptz` | não | `now()` | |

**Restrições:** **UNIQUE** `(user_id, bu_id)`.
**Índices:** `bu_id`, `user_id`.

---

## Tabela `client`

Clientes da 3F. Tabela **migrada em 2026-07** do banco da plataforma de contratos
(`sistema_gestao.clients`) para a Core, porque quase todos os sistemas internos passaram a precisar
consumir dados de cliente. Segue o mesmo padrão *identidade-na-Core + overlay-local* que já existe
para `user`↔`sellers` e `bu`↔`bu_settings`: **a identidade fica aqui**; o que é específico de um
sistema fica na tabela de overlay dele (no sistema de gestão: `client_settings`, com `contact_id`,
`is_delinquent`, `squad_id_manual`).

> **Os IDs foram preservados na migração** (mesmos valores, sem remapeamento/crosswalk). As colunas
> `client_id` em `contracts` / `contract_churns` / `spiced` no `sistema_gestao` continuam válidas —
> mas **sem FK real**, porque o Postgres não faz FK entre bancos.

| Coluna | Tipo (Postgres) | Nulo | Default | Restrições / Observações |
|---|---|---|---|---|
| `id` | `bigserial` (int8) | não | autoincremento | **PK** — **BigInt** no banco; a API expõe como **number** (ver nota abaixo) |
| `type` | `varchar(2)` | não | — | **CHECK** `IN ('pf','pj')` — minúsculo |
| `name` | `text` | não | — | |
| `common_name` | `varchar(150)` | sim | — | Nome comum/usual do cliente, distinto de `name` (razão social). Coluna nova em 2026-07-31 |
| `document` | `text` | não | — | **UNIQUE**. CPF/CNPJ — **armazenado sem pontuação** (só dígitos) |
| `email` | `text` | sim | — | |
| `phone` | `text` | sim | — | |
| `instagram` | `text` | sim | — | |
| `cep` | `text` | sim | — | Armazenado **com** máscara (`00000-000`) |
| `logradouro` | `text` | sim | — | ⚠️ nomes de endereço em **português** (≠ `user`, que usa `street`/`city`/`state`) |
| `numero` | `text` | sim | — | Texto livre (há valores de até 51 chars, tipo "Quadra X Lote Y") |
| `complement` | `text` | sim | — | Coluna **nova** na migração (vazia hoje) |
| `bairro` | `text` | sim | — | |
| `cidade` | `text` | sim | — | |
| `uf` | `text` | sim | — | Sigla de 2 letras |
| `representative_name` | `text` | sim | — | Representante legal (uso típico em `pj`) |
| `representative_cpf` | `text` | sim | — | Sem pontuação (só dígitos) |
| `representative_email` | `text` | sim | — | |
| `status` | `varchar(20)` | não | `'active'` | **CHECK** com **5** valores (ver nota). Ciclo de vida **comercial** — não confundir com `is_active` |
| `squad_id` | `int4` | sim | — | **FK** → `squad.id` (**ON DELETE NO ACTION** — ver nota) |
| `specialist_id` | `int4` | sim | — | **FK** → `user.id` (**NO ACTION**). Especialista de atendimento. **100% NULL hoje** |
| `logo_picture` | `text` | sim | — | Caminho/base64 do logo. **Vazio em todos os registros hoje** |
| `is_active` | `boolean` | não | `true` | Soft-delete do registro — **não** é "cliente ativo", ver nota |
| `created_by` | `int4` | sim | — | **FK** → `user.id` (**NO ACTION**). **100% NULL hoje**. Coluna **nova** na migração |
| `created_at` | `timestamptz` | não | `now()` | Preservado da tabela original |
| `updated_at` | `timestamptz` | não | `now()` | Preservado da tabela original |

**Índices:** `status`, `squad_id`, `specialist_id`, `is_active`, `email` (+ o índice do `UNIQUE` em
`document`).

**Volume atual (medido em 2026-07-30):** 293 registros, `max(id) = 298` (a sequence está em 298; os
5 números faltantes são registros excluídos no passado — sequence não reaproveita número).
Distribuição: `status` → `active` 259, `churn` 31, `em_cancelamento` 3; `type` → `pj` 214, `pf` 79;
`squad_id` preenchido em 15.

### Valores de `status` (CHECK `client_status_check`)

| Valor | Significado |
|---|---|
| `active` | Cliente ativo (**default** da coluna) |
| `aguardando_renovacao` | Contrato perto do vencimento, em negociação de renovação |
| `em_cancelamento` | Aviso prévio em curso (janela padrão de 30 dias) |
| `churn` | Encerramento efetivado — saída comercial |
| `cancelado` | Anulação administrativa — trilha **separada** do churn |

`aguardando_renovacao` e `cancelado` foram acrescentados em **2026-07-30** (mudança aditiva, a pedido
do Sistema de Gestão, que já operava com 5 estados). **`cancelado` não é `churn`** — não some os dois
em métrica de saída comercial.

> ⚠️ **Não há enum nativo no Postgres deste banco** (`pg_enum` está vazio): `status` é `varchar(20)` +
> CHECK. O conjunto de valores válidos vive em **dois** lugares — o CHECK e o `z.enum` da API — e os
> dois têm que ser alterados juntos, **CHECK primeiro**. Só o Zod estendido faz o request passar a
> validação e estourar na escrita.
>
> ⚠️ **`'aguardando_renovacao'` ocupa exatamente 20 dos 20 chars da coluna.** Status futuro mais longo
> exige alargar a coluna antes.

### ⚠️ `status` ≠ `is_active` — os dois coexistem, com significados diferentes

Decisão consciente da migração. **Não** são redundantes:

- **`status`** = ciclo de vida **comercial** (ver tabela acima). É o que a regra de negócio consulta.
- **`is_active`** = **soft-delete do registro** (convenção de toda tabela da Core). Um cliente em
  churn é um registro **válido**, então todos os 293 entraram com `is_active = true`.

> **Regra para integradores:** filtre por **`status`** para negócio; `is_active` serve só para
> esconder registro excluído. **Quem filtrar `is_active = true` esperando "clientes ativos" vai
> trazer os churns junto.**

### ⚠️ As FKs de `client` são `ON DELETE NO ACTION` (assimetria com o resto da Core)

Verificado em `pg_constraint`: as três FKs de `client` são `NO ACTION`, enquanto todas as outras FKs
da Core apontando para `user`/`squad` são `SET NULL` (ou `CASCADE`, nos pivôs). Como `NO ACTION`
**bloqueia a exclusão do pai** em vez de anular o filho, isso afeta rotas de outros recursos:

- `DELETE /squads/:id` → **`409 FK_CONSTRAINT`** se o squad tiver clientes (já é o caso de 15 deles).
- `DELETE /users/:id` → **`409 FK_CONSTRAINT`** se o usuário for `specialist_id` ou `created_by` de
  algum cliente (não ocorre hoje, pois as duas colunas estão NULL; passará a ocorrer quando forem
  usadas).

### Outras notas

- **`specialist_id` nasceu NULL de propósito.** Na origem havia só dois valores distintos, ambos
  apontando para *devs*, não para especialistas reais de atendimento — foram descartados para a FK
  nova nascer limpa. Quando a atribuição passar a valer, grave o **`user.id` da Core** (não o
  `sellers.id` local: são espaços de ID independentes).
- **Inconsistências conhecidas, mantidas de propósito** (corrigir exige mudança de código):
  `'em_cancelamento'` está em português entre dois valores em inglês; e `type` é `'pf'`/`'pj'`
  **minúsculo**, enquanto `contracts_templates.person_type` no sistema de gestão usa `'PJ'`
  maiúsculo.
- **A tabela nasceu sem o trigger de `updated_at`** (as 8 outras tabelas da Core sempre tiveram).
  Corrigido em 2026-07-30 com `trg_client_updated_at`. Antes disso, `client.updated_at` nunca avançava
  em `UPDATE` — inclusive nas escritas via `PATCH /clients/:id`.
- **Cutover concluído em 2026-07-30.** A `sistema_gestao.clients` deixou de ser a fonte de verdade; o
  sistema de gestão passou a ler/gravar cliente pela Core. A tabela antiga continua no banco
  (renomeação para `clients_legacy` é etapa posterior) — **mas com escrita revogada**, para que
  qualquer referência esquecida no código falhe alto em vez de gravar em silêncio.
- **A carga inicial (27/07) ficou incompleta e isso só apareceu na conciliação final.** Ao comparar
  contagem + checksum por coluna entre os dois bancos, faltavam **4 clientes reais** na Core (ids 301,
  302, 303, 304) e havia **1 divergência de `squad_id`** (cliente 298). Todos corrigidos. Lição para
  migrações futuras: **`COUNT(*)` e checksum por coluna** são o que fecha a conta — filtro por
  `created_at`/`updated_at` deu **falso negativo** (a app seguia escrevendo, e `updated_at` não
  avançava por falta do trigger).

---

## Notas para integradores

1. **Você nunca fala com o banco.** Todo acesso é via HTTP + `X-API-Key`. Este doc serve para
   entender os campos que os endpoints retornam/aceitam.
2. **Campos sensíveis nunca trafegam:** `user.password` e `api_key.key_hash` são omitidos em todas
   as respostas.
3. **`is_active` ≠ exclusão.** `DELETE` é exclusão real (hard delete). `is_active` é um
   *soft-disable* independente, alterado via `PATCH`. **Exceção: `client` não tem `DELETE`** — é o
   único recurso sem hard delete (churn é histórico financeiro referenciado de fora, sem FK real),
   então lá desativar via `PATCH { is_active: false }` é o único caminho.
4. **Obrigatórios "ocultos":** colunas como `created_by` (em `department`, `position`, `band`,
   `api_key`) e `leader_id` (em `squad`) são *nullable* no banco, mas a API **exige** no create.
   **`client.created_by` NÃO entra nessa lista** — lá é opcional de verdade.
5. **CASCADE:** apagar um `system` apaga suas `api_key`, `systems_users` e `systems_bus` em cascata;
   apagar um `user`/`bu` apaga os vínculos `systems_users`/`users_bus`/`systems_bus` correspondentes;
   apagar um `systems_users` apaga seu histórico de `systems_users_access`. **`client` é a exceção:**
   suas FKs são `NO ACTION`, então ele **bloqueia** a exclusão do `squad`/`user` referenciado
   (409) em vez de ser anulado em cascata — ver a seção da tabela `client`.
6. **BigInt:** o `id` de `systems_users_access` é BigInt e a API o serializa como **string**.
   `client.id` também é BigInt no banco, mas a API o expõe como **number** — porque, ao contrário do
   id de log, ele é referenciado como FK inteira normal pelos outros sistemas, e os valores atuais
   (~300) estão muito abaixo do limite seguro de precisão do JavaScript.
7. **Nomes de endereço divergem entre recursos:** `user` usa `street`/`street_number`/`neighborhood`/
   `city`/`state`; `client` usa `logradouro`/`numero`/`bairro`/`cidade`/`uf` (herdado da tabela de
   origem). Não são intercambiáveis — confira o recurso antes de mapear um formulário de endereço.
