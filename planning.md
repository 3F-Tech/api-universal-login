# Contexto do Projeto

Você vai desenvolver uma **API de identidade centralizada** para a empresa **3F Venture**. O objetivo é unificar a autenticação e gestão de usuários de múltiplos sistemas internos que hoje têm tabelas de `users` duplicadas. Esta API será a fonte da verdade para identidade — outros sistemas vão consumi-la para validar logins e consultar dados de usuários, BUs, squads, etc.

**Universal Key:** todo email corporativo segue o padrão `<nome>@3fventure.com.br`

## Arquitetura Geral

```
[Sistemas internos em N VPS] ──HTTPS──▶ [API 3F Core (esta API)] ──TCP──▶ [PostgreSQL 17 em VPS dedicada]
```

- A API roda em uma VPS própria
- O Postgres já está rodando em outra VPS (banco `3f_core` já criado e populado com 11 tabelas — schema descrito abaixo)
- Sistemas consumidores autenticam via **API Key estática** (header `X-API-Key`)
- Acesso ao banco em desenvolvimento via **túnel SSH**
- Em produção, acesso restrito por **firewall (UFW)** nos IPs das VPS autorizadas

## Stack Obrigatória

| Camada                   | Tecnologia                                                 |
| ------------------------ | ---------------------------------------------------------- |
| Runtime                  | Node.js 20 LTS                                             |
| Linguagem                | TypeScript (strict mode)                                   |
| Framework HTTP           | Express 4                                                  |
| ORM                      | Prisma (introspectar banco existente via `prisma db pull`) |
| Validação                | Zod                                                        |
| Hash de senha de usuário | bcrypt (cost factor 12)                                    |
| Hash de API Key          | SHA-256 (Node crypto nativo)                               |
| Logging                  | Pino + pino-pretty (dev)                                   |
| Variáveis ambiente       | dotenv + validação Zod                                     |
| Linter/Formatter         | ESLint + Prettier                                          |
| Testes                   | Vitest                                                     |
| Process manager (prod)   | PM2                                                        |

## Schema do Banco (já criado, NÃO criar novamente)

O banco PostgreSQL 17 chamado `3f_core` já existe com as 11 tabelas abaixo. Use `prisma db pull` para introspectar e gerar o `schema.prisma` automaticamente. NÃO faça migrations criando tabelas — o banco é a fonte da verdade.

**Tabelas:**

1. **`user`** — usuários (PK: id, UNIQUE: email, cpf, cnpj)
   - Campos pessoais: name, email, personal_email, password (hash bcrypt), birth_date, cpf, cnpj, sex, phone, instagram, linkedin
   - Hierarquia: role (string livre: leader_top/head_bu/coordinator_departament/leader/collaborator/adm), department_id, position_id, bu_id, band_id, squad_id (todas FK nullable)
   - Endereço: cep, street, street_number, neighborhood, complement, city, state, country (todos nullable)
   - Meta: profile_picture, is_active, created_at, updated_at

2. **`bu`** — Business Units com auto-relacionamento (parent_id → bu)
   - id, name, description, slug (UNIQUE), primary_color_hex, secondary_color_hex, parent_id, logo_picture, is_active, timestamps

3. **`squad`** — squads dentro de BUs
   - id, name, description, picture, leader_id (FK → user), bu_id (FK → bu), is_active, timestamps

4. **`department`** — id, name, icon, is_active, timestamps, created_by (FK → user)

5. **`position`** — id, name, is_active, timestamps, created_by (FK → user) _(nome reservado em SQL, requer aspas duplas)_

6. **`band`** — id, name, color_hex, sort_order, is_active, timestamps, created_by (FK → user)

7. **`system`** — catálogo de sistemas internos
   - id, name, description, link, logo_picture, is_active, timestamps

8. **`systems_users`** — N:N user ↔ system (UNIQUE composto: system_id+user_id)
   - id, system_id, user_id, created_at

9. **`systems_bus`** — N:N system ↔ bu (PK composta: system_id+bu_id, sem id próprio)

10. **`systems_users_access`** — log de acessos
    - id (BIGSERIAL), systems_users_id, accessed_at, success (boolean)

11. **`api_key`** — chaves de API por sistema
    - id, system_id (FK), name, key_hash (SHA-256 da key real, UNIQUE), key_prefix (12 chars visíveis), scopes (TEXT[]), last_used_at, expires_at (nullable), is_active, timestamps, created_by (FK → user)

**Convenções do schema:**

- Toda tabela tem `is_active BOOLEAN` (soft-disable, não soft-delete)
- Toda tabela tem `created_at` e `updated_at` (TIMESTAMPTZ, trigger automático no `updated_at`)
- FKs de relacionamento principal usam `ON DELETE SET NULL`
- FKs de tabelas pivot usam `ON DELETE CASCADE`
- `user.password` é `VARCHAR(60)` (bcrypt sempre gera 60 chars)

## Endpoints da API (planejamento inicial)

Implemente os módulos abaixo. Cada módulo segue padrão: `routes.ts` → `controller.ts` → `service.ts` → `schema.ts` (Zod).

### Módulos obrigatórios na primeira versão:

1. **`/health`** — GET healthcheck (sem auth)
2. **`/auth/validate`** — POST valida credenciais (email + password), retorna dados do user se OK. Registra em `systems_users_access` (success true/false) automaticamente, identificando o sistema pela API Key.
3. **`/users`** — CRUD completo (GET list com paginação, GET by id, POST, PATCH, DELETE)
4. **`/bus`** — CRUD completo (incluindo árvore hierárquica via parent_id)
5. **`/squads`** — CRUD completo
6. **`/departments`** — CRUD completo
7. **`/positions`** — CRUD completo
8. **`/bands`** — CRUD completo
9. **`/systems`** — CRUD completo
10. **`/api-keys`** — CRUD de keys (geração retorna a key UMA VEZ; depois só hash fica no banco)

### Sistema de scopes (autorização por API Key)

Cada API Key tem um array de scopes em `api_key.scopes`. Implemente middleware que valida se a key tem o scope necessário pra cada endpoint. Scopes sugeridos:

- `auth:validate`
- `users:read`, `users:write`, `users:delete`
- `bus:read`, `bus:write`, `bus:delete`
- `squads:read`, `squads:write`, `squads:delete`
- `departments:read`, `departments:write`, `departments:delete`
- `positions:read`, `positions:write`, `positions:delete`
- `bands:read`, `bands:write`, `bands:delete`
- `systems:read`, `systems:write`, `systems:delete`
- `api-keys:read`, `api-keys:write`, `api-keys:delete`
- `admin:*` (super scope, libera tudo)

## Estrutura de Pastas Obrigatória

```
3f-core-api/
├── src/
│   ├── config/
│   │   ├── env.ts                 # Validação de variáveis com Zod
│   │   └── database.ts            # Singleton PrismaClient
│   ├── middleware/
│   │   ├── api-key.ts             # Valida X-API-Key e injeta req.apiKey + req.system
│   │   ├── require-scope.ts       # Factory: requireScope('users:read')
│   │   ├── error-handler.ts       # Captura e formata erros (zod, prisma, custom)
│   │   ├── rate-limit.ts          # express-rate-limit por API Key
│   │   └── request-logger.ts      # Log estruturado de cada request
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── bus/
│   │   ├── squads/
│   │   ├── departments/
│   │   ├── positions/
│   │   ├── bands/
│   │   ├── systems/
│   │   └── api-keys/
│   ├── utils/
│   │   ├── bcrypt.ts              # hash/compare
│   │   ├── api-key-generator.ts   # Gera key + retorna {key, hash, prefix}
│   │   ├── logger.ts              # Pino configurado
│   │   └── errors.ts              # Classes: AppError, NotFoundError, ConflictError, etc.
│   ├── app.ts                     # Configuração Express (middlewares, rotas)
│   └── server.ts                  # Boot (listen, graceful shutdown)
├── prisma/
│   ├── schema.prisma              # Gerado via db pull
│   └── seed.ts                    # (opcional) seed de dev
├── tests/
│   ├── helpers/
│   └── modules/
├── .env.example
├── .env                           # NUNCA commitar (já no .gitignore)
├── .gitignore
├── .gitattributes                 # text=auto eol=lf
├── .prettierrc
├── .eslintrc.json
├── tsconfig.json
├── package.json
├── README.md
└── docker-compose.dev.yml         # Postgres local pra dev (alternativa ao SSH tunnel)
```

## Requisitos de Qualidade

### Cross-platform (Windows / Linux / macOS)

A equipe tem devs em vários SOs. OBRIGATÓRIO:

- `.gitattributes` com `* text=auto eol=lf`
- `engines` no `package.json` exigindo Node ≥ 20
- Scripts npm usando `cross-env` quando precisar setar variáveis
- Sempre `path.join()` / `path.resolve()`, nunca strings com `/` ou `\`
- Comandos shell em scripts npm devem ser portáveis (usar libs Node quando possível)

### Segurança

- **bcrypt cost 12** pra senhas de usuário
- **SHA-256** pro hash de API keys (rápido, suficiente porque keys são longas e aleatórias)
- **API Key** no formato: `3fc_<env>_<32 chars aleatórios base62>` (ex: `3fc_live_aB3kP9...`). Os primeiros 12 chars (`3fc_live_aB3`) viram o `key_prefix`.
- **Helmet** middleware ativo
- **CORS** desabilitado por padrão (a API é backend-to-backend; CORS só se precisar e configurado explicitamente)
- **Rate limit** por API Key (configurável via env, padrão: 100 req/min)
- **HTTPS obrigatório** em produção (Nginx/Caddy reverso na frente — não implementar nesta API, só documentar no README)
- Nunca logar: passwords, API keys cruas, hashes. Logar apenas `key_prefix` quando referenciar key.
- Validação rigorosa de input com Zod em TODOS os endpoints
- Sanitização: trimar strings, normalizar emails pra lowercase

### Tratamento de erros

Classes de erro customizadas com status HTTP apropriado:

- `AppError` (base)
- `ValidationError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409) — pra UNIQUE violations
- `InternalError` (500)

Middleware `error-handler` captura tudo e retorna JSON padronizado:

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with id 123 not found",
    "details": { ... }  // opcional
  }
}
```

### Padrão de resposta

Sucesso (lista):

```json
{
  "data": [ ... ],
  "meta": { "total": 150, "page": 1, "perPage": 20 }
}
```

Sucesso (item único):

```json
{ "data": { ... } }
```

### Configuração de `.env`

Validar com Zod no `src/config/env.ts`. Variáveis:

```
NODE_ENV=development|production|test
PORT=3000
DATABASE_URL=postgresql://3f_core_app:senha@localhost:5432/3f_core
LOG_LEVEL=debug|info|warn|error
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
BCRYPT_COST=12
```

Se alguma variável faltar ou for inválida, app NÃO sobe e mostra erro claro.

### Logging

- Usar Pino com `pino-pretty` em dev
- Cada request gera log com: method, path, status, duration_ms, api_key_prefix, ip
- Erros 5xx logam stack trace completo
- Erros 4xx logam só mensagem + contexto
- NUNCA logar senhas, keys cruas, ou dados sensíveis (CPF/CNPJ podem mascarar)

### Testes

- Vitest configurado
- Pelo menos 1 teste smoke por módulo (health check da rota)
- Helpers para criar dados de teste (factories)
- Não obrigatório cobertura alta nesta primeira versão, mas estrutura tem que estar pronta

## Setup do Ambiente de Dev

Crie um `docker-compose.dev.yml` rodando Postgres 17 local pra dev, com o MESMO schema da VPS. O dev deve poder escolher entre:

**Opção A — Postgres local (Docker):**

```bash
docker compose -f docker-compose.dev.yml up -d
# DATABASE_URL aponta pra localhost:5432
```

**Opção B — Túnel SSH pra VPS:**

```bash
ssh -L 5433:localhost:5432 user@vps-do-banco
# DATABASE_URL aponta pra localhost:5433 (porta diferente pra não conflitar)
```

Documente AMBAS as opções no README com comandos prontos pra Windows (PowerShell) e Linux/Mac (bash).

## README

O README precisa ter:

1. Descrição do projeto
2. Stack
3. Pré-requisitos (Node 20+, Git, opcionalmente Docker)
4. Setup passo a passo (clonar, instalar, configurar .env, escolher entre Docker local ou SSH tunnel, rodar `prisma db pull` + `prisma generate`, rodar `npm run dev`)
5. Scripts disponíveis (`dev`, `build`, `start`, `test`, `lint`, `format`, `prisma:pull`, `prisma:generate`)
6. Estrutura de pastas explicada
7. Como criar uma nova API Key (script CLI ou endpoint admin)
8. Como adicionar novo endpoint (passo a passo de exemplo)
9. Deploy em produção (PM2, Nginx reverso, firewall UFW restringindo IPs)
10. Troubleshooting comum

## Tarefas (execute nesta ordem)

1. **Crie a estrutura de pastas** completa conforme especificado
2. **Inicialize o projeto:** `npm init`, instale dependências e devDependencies
3. **Configure TypeScript** com `tsconfig.json` strict mode, target ES2022, moduleResolution node
4. **Configure ESLint + Prettier** com regras razoáveis (sem briga entre eles)
5. **Configure `.gitignore`, `.gitattributes`, `.env.example`**
6. **Crie `src/config/env.ts`** com validação Zod
7. **Configure Prisma:** `prisma init`, ajuste `schema.prisma` pra Postgres, NÃO crie models manualmente — apenas documente que `prisma db pull` deve ser rodado após configurar `.env`
8. **Crie utils:** logger, bcrypt, api-key-generator, errors
9. **Crie middlewares:** error-handler, request-logger, api-key, require-scope, rate-limit
10. **Crie `src/app.ts` e `src/server.ts`** com setup completo + graceful shutdown
11. **Implemente o módulo `/health`** primeiro (sanity check)
12. **Implemente o módulo `/auth/validate`** com registro em `systems_users_access`
13. **Implemente módulos CRUD** na ordem: api-keys → users → bus → squads → departments → positions → bands → systems
14. **Crie `docker-compose.dev.yml`** com Postgres 17 + script SQL pra criar o schema idêntico ao da VPS (vou fornecer o DDL completo se necessário, ou você pode adaptar do `schema.prisma` gerado)
15. **Escreva o README completo**
16. **Configure scripts npm:** `dev` (tsx watch), `build` (tsc), `start` (node dist), `test` (vitest), `lint`, `format`, `prisma:pull`, `prisma:generate`
17. **Crie um teste smoke** pra cada módulo
18. **Commit inicial** com mensagem descritiva (se git estiver disponível)

## Restrições Importantes

- **NÃO crie migrations Prisma criando tabelas** — o banco já existe, use `db pull`
- **NÃO use `any` em TypeScript** sem justificativa em comentário
- **NÃO commite `.env`** (só `.env.example`)
- **NÃO hardcode credenciais, URLs ou IPs** — tudo via env
- **NÃO implemente frontend** — esta API é só backend
- **NÃO use CORS aberto** (`*`) — se precisar CORS, restringir explicitamente
- **NÃO logue dados sensíveis** (senhas, keys, hashes completos)

## Entregáveis Finais

Ao terminar, me mostre:

1. Árvore de arquivos criada (`tree -L 3 -I node_modules` ou equivalente)
2. Conteúdo do `package.json` final
3. Como rodar o projeto localmente do zero
4. Lista de qualquer decisão tomada que não estava explícita nas instruções (justificada)
5. Lista de TODO/melhorias futuras que você identificou mas não implementou (timeouts de conexão, observabilidade avançada, etc.)

## Quando tiver dúvida

Se você tiver QUALQUER dúvida sobre o desenvolvimento deste projeto, você NÃO deve tentar descobrir por si só. Você DEVE me perguntar sempre. Apenas comece o desenvolvimento quando estiver seguro de suas informações e das minhas instruções.
