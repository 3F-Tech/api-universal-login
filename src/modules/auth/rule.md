# rule.md — módulo `auth`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

Valida credenciais de **usuário** (email + senha) para o sistema chamador e registra o acesso em
`systems_users_access`. É a única lógica de autenticação de usuário final da API (a autenticação do
*sistema* consumidor é por API Key, no middleware). Sem CRUD: um único endpoint.

## Endpoints

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| POST | `/auth/validate` | `auth:validate` | Valida email+senha do usuário para o sistema da API Key |

O **sistema** alvo não vem no body — é inferido da API Key (`req.system`, injetado pelo `apiKeyAuth`).
Se o contexto de sistema faltar → `401 SYSTEM_CONTEXT_MISSING` (defensivo; o middleware já garante).

## Schema (Zod) — `schema.ts`

- `validateCredentialsSchema`: `email` (trim, lowercase, formato, máx 150) + `password` (1–72 chars).
  O limite de 72 é o teto do bcrypt.

## Regra de negócio (decisão travada — ver `CLAUDE.md`)

Ordem e efeitos exatos do `validateCredentials(email, password, systemId)`:

| Situação | Log em `systems_users_access` | Resposta |
|---|---|---|
| User inexistente | **não loga** (não há vínculo pra registrar) | `401 INVALID_CREDENTIALS` |
| Sem vínculo em `systems_users` p/ esse sistema | **não loga** | `403 NO_SYSTEM_ACCESS` |
| Conta inativa (com vínculo) | `success=false` | `403 ACCOUNT_INACTIVE` |
| Senha errada (com vínculo) | `success=false` | `401 INVALID_CREDENTIALS` |
| Tudo certo | `success=true` | `200` + usuário (sem `password`) + suas BUs |

- A senha é verificada **antes** de checar o vínculo (ordem do briefing), mas o resultado só é
  registrado/aplicado depois de confirmar que existe vínculo.
- **Não** atualiza `api_key.last_used_at` aqui — o `apiKeyAuth` já faz isso em toda request.

## Service — `service.ts`

- `validateCredentials(...)` retorna `ValidatedUser = SafeUser & { bus: UserBu[] }`:
  - `SafeUser` = `user` sem `password`.
  - `bus` = BUs do usuário via `users_bus` (N:N), cada uma com o flag **`from_squad`** (true = BU do
    squad, marcada pelo front).
- `registerAccess(systemsUsersId, success)` insere uma linha em `systems_users_access`.

## Erros

`INVALID_CREDENTIALS` (401), `NO_SYSTEM_ACCESS` (403), `ACCOUNT_INACTIVE` (403),
`SYSTEM_CONTEXT_MISSING` (401).

## Gotchas

- **Mensagem genérica de propósito:** user inexistente e senha errada retornam ambos
  `INVALID_CREDENTIALS` (não revelar se o email existe). Mas os status diferem (401 vs 403) conforme
  a tabela — siga-a à risca.
- Nunca retornar `password`. O retorno usa desestruturação pra remover o hash.
- A relação user↔BU é **N:N** (`users_bus`), não mais `user.bu_id` (coluna removida).
