# DATABASE.md — 3F Core API

Estrutura completa do banco de dados da **3F Core API** (`api-universal-login`), a base de
identidade centralizada da 3F Venture. Este documento é a **referência de schema** para qualquer
sistema/IA que vá integrar com esta API.

- **SGBD:** PostgreSQL
- **Fonte da verdade:** o **banco** (o schema do Prisma é *introspectado*, nunca escrito à mão).
- **Convenção de nomes:** tabelas e colunas em `snake_case`.
- **Timestamps:** `created_at` / `updated_at` são `timestamptz` (UTC). `updated_at` **não** é
  atualizado por trigger no banco — quem grava é a API.
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

### Mapa de relacionamentos (resumo)

```
system ─┬──< api_key            (system_id, CASCADE)
        ├──< systems_users >──── user        (N:N, role por sistema)
        └──< systems_bus  >──── bu           (N:N)

user ───┬──< users_bus >─────── bu           (N:N, from_squad)
        ├──> department         (department_id)
        ├──> position           (position_id)
        ├──> band               (band_id)
        └──> squad              (squad_id)

bu ─────── bu                   (parent_id → árvore)
squad ──┬──> bu                 (bu_id)
        └──> user               (leader_id)

systems_users ──< systems_users_access   (systems_users_id, CASCADE)

# created_by aponta para user em: api_key, band, department, position
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
| `profile_picture` | `text` | sim | — | URL / caminho da foto / base64 |
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

**Índices:** `email`, `cpf`, `department_id`, `squad_id`, `is_active`.

**Relações:** vínculos N:N com `bu` (via `users_bus`) e com `system` (via `systems_users`). Também é
referenciado como `created_by` em `api_key`, `band`, `department`, `position`, e como `leader_id` em
`squad`.

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
| `success` | `boolean` | não | — | `true` = login válido; `false` = tentativa falha |

**Índices:** `accessed_at` (DESC), `systems_users_id`.

> Registrado pelo fluxo de `POST /auth/validate`: sucesso → `success=true`; conta inativa ou senha
> errada (com vínculo) → `success=false`. Casos sem vínculo / user inexistente **não** geram log.

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

## Notas para integradores

1. **Você nunca fala com o banco.** Todo acesso é via HTTP + `X-API-Key`. Este doc serve para
   entender os campos que os endpoints retornam/aceitam.
2. **Campos sensíveis nunca trafegam:** `user.password` e `api_key.key_hash` são omitidos em todas
   as respostas.
3. **`is_active` ≠ exclusão.** `DELETE` é exclusão real (hard delete). `is_active` é um
   *soft-disable* independente, alterado via `PATCH`.
4. **Obrigatórios "ocultos":** colunas como `created_by` (em `department`, `position`, `band`,
   `api_key`) e `leader_id` (em `squad`) são *nullable* no banco, mas a API **exige** no create.
5. **CASCADE:** apagar um `system` apaga suas `api_key`, `systems_users` e `systems_bus` em cascata;
   apagar um `user`/`bu` apaga os vínculos `systems_users`/`users_bus`/`systems_bus` correspondentes;
   apagar um `systems_users` apaga seu histórico de `systems_users_access`.
6. **BigInt:** o `id` de `systems_users_access` é BigInt — trate como string no seu lado para evitar
   perda de precisão / erro de serialização.
