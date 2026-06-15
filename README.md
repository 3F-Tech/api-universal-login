# 3F Core API (`api-universal-login`)

API de **identidade centralizada** da 3F Venture. É a fonte da verdade de identidade: outros
sistemas internos consomem esta API para **validar logins** e **consultar/gerenciar** usuários,
BUs, squads, departamentos, cargos, bands, sistemas e API Keys.

Comunicação **backend-to-backend**, autenticada por **API Key** (header `X-API-Key`), com
autorização por **scopes**.

```
[Sistemas internos em N VPS] ──HTTPS──▶ [API 3F Core (esta API)] ──TCP──▶ [PostgreSQL 17 em VPS dedicada]
```

---

## 1. Descrição

- **Autenticação de usuários:** `POST /auth/validate` valida `email`+`password` (bcrypt) para o
  sistema chamador e registra cada tentativa em `systems_users_access`.
- **CRUD** de `users`, `bus` (com árvore hierárquica), `squads`, `departments`, `positions`,
  `bands`, `systems` e `api-keys`.
- **Relacionamentos:** vínculos N:N usuário↔sistema e BU↔sistema, e consulta de logs de acesso.
- **Segurança:** API Keys hasheadas com SHA-256, senhas com bcrypt (cost 12), Helmet, rate limit
  por key, CORS desabilitado por padrão, validação rigorosa com Zod.

> O banco PostgreSQL **já existe** e é a fonte da verdade. O schema do Prisma é **gerado por
> introspecção** (`prisma db pull`) — nunca criamos/alteramos tabelas via Prisma.

---

## 2. Stack

| Camada          | Tecnologia                                                      |
| --------------- | --------------------------------------------------------------- |
| Runtime         | Node.js ≥ 20 (testado em 24)                                    |
| Linguagem       | TypeScript (strict, **ESM / NodeNext**)                         |
| Framework HTTP  | **Express 5**                                                   |
| ORM             | **Prisma 7** + driver adapter `@prisma/adapter-pg` (sobre `pg`) |
| Validação       | Zod                                                             |
| Hash de senha   | bcrypt (cost 12)                                                |
| Hash de API Key | SHA-256 (`node:crypto`)                                         |
| Logging         | Pino (+ pino-pretty em dev)                                     |
| Segurança HTTP  | Helmet, express-rate-limit                                      |
| Testes          | Vitest + Supertest                                              |
| Lint/Format     | ESLint 10 (flat config) + Prettier                              |
| Process manager | PM2 (produção)                                                  |

> **Nota Prisma 7:** o engine embutido foi removido. A conexão é feita por um **driver adapter**
> (runtime, em `src/config/database.ts`) e a connection string da CLI vive em `prisma.config.ts`
> — **não** mais em `schema.prisma`.

---

## 3. Pré-requisitos

- **Node.js ≥ 20** e **npm**
- **Git**
- Acesso ao banco `3f_core`, por **uma** das opções:
  - **Docker** (sobe um Postgres 17 local idêntico ao da VPS), ou
  - **Túnel SSH** para a VPS do banco.

---

## 4. Setup passo a passo

### 4.1. Clonar e instalar

```bash
git clone <repo-url> api-universal-login
cd api-universal-login
npm install
```

### 4.2. Configurar `.env`

```bash
# Linux/Mac
cp .env.example .env
```

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
```

Edite o `.env` e ajuste o `DATABASE_URL` conforme a opção escolhida abaixo.

### 4.3. Subir o banco — escolha A **ou** B

#### Opção A — Postgres local via Docker (recomendado p/ dev)

```bash
# Linux/Mac/Windows (com Docker Desktop)
docker compose -f docker-compose.dev.yml up -d
```

`DATABASE_URL` no `.env`:

```
DATABASE_URL=postgresql://3f_core_app:dev_change_me@localhost:5432/3f_core?schema=public
```

> O schema é criado automaticamente na primeira subida (`docker/postgres/init/01-schema.sql`).

#### Opção B — Túnel SSH para a VPS do banco

```bash
# Linux/Mac (bash) — deixe rodando em um terminal, ou use -f -N para background
ssh -f -N -L 5433:localhost:5432 SEU_USER@HOST_DO_BANCO
```

```powershell
# Windows (PowerShell) — OpenSSH client
ssh -f -N -L 5433:localhost:5432 SEU_USER@HOST_DO_BANCO
```

`DATABASE_URL` no `.env` (porta **5433** para não conflitar com um Postgres local):

```
DATABASE_URL=postgresql://3f_core_app:SUA_SENHA@localhost:5433/3f_core?schema=public
```

### 4.4. Introspectar o banco e gerar o client

```bash
npm run prisma:pull       # gera prisma/schema.prisma a partir do banco
npm run prisma:generate   # gera o Prisma Client tipado
```

### 4.5. Rodar

```bash
npm run dev               # tsx watch (hot reload)
# API em http://localhost:3000  (GET /health não exige API key)
```

### 4.6. (Opcional) Popular dados de teste

```bash
npm run db:seed           # cria sistema demo + API key admin + usuário demo (imprime a key)
```

---

## 5. Scripts disponíveis

| Script                    | O que faz                                |
| ------------------------- | ---------------------------------------- |
| `npm run dev`             | Sobe em modo watch (tsx)                 |
| `npm run build`           | Compila TypeScript para `dist/`          |
| `npm start`               | Roda o build (`node dist/server.js`)     |
| `npm test`                | Roda os testes (Vitest)                  |
| `npm run test:coverage`   | Testes com cobertura                     |
| `npm run lint`            | ESLint                                   |
| `npm run format`          | Prettier (write)                         |
| `npm run typecheck`       | `tsc --noEmit`                           |
| `npm run prisma:pull`     | Introspecta o banco → `schema.prisma`    |
| `npm run prisma:generate` | Gera o Prisma Client                     |
| `npm run prisma:studio`   | Abre o Prisma Studio                     |
| `npm run db:seed`         | Seed de desenvolvimento                  |
| `npm run key:create`      | CLI para criar uma API Key (ver seção 7) |

---

## 6. Estrutura de pastas

```
src/
├── config/
│   ├── env.ts            # Validação das variáveis de ambiente (Zod)
│   ├── database.ts       # Singleton do PrismaClient (via driver adapter pg)
│   └── scopes.ts         # Catálogo de scopes de autorização
├── middleware/
│   ├── api-key.ts        # Valida X-API-Key; injeta req.apiKey + req.system
│   ├── require-scope.ts  # Factory: requireScope('users:read')
│   ├── rate-limit.ts     # Rate limit por API Key
│   ├── request-logger.ts # Log estruturado por request (pino-http)
│   └── error-handler.ts  # Converte erros no envelope JSON padrão
├── modules/              # Um módulo por recurso: routes → controller → service → schema
│   ├── health/ auth/ users/ api-keys/ bus/ squads/ departments/
│   ├── positions/ bands/ systems/
│   └── systems-users/ systems-bus/ access-logs/
├── utils/                # logger, bcrypt, api-key-generator, errors, http, pagination, ...
├── types/express.d.ts    # Aumenta o Request com apiKey/system
├── app.ts                # Montagem do Express (middlewares + rotas)
├── routes.ts             # Agrega os routers protegidos
└── server.ts             # Boot + graceful shutdown

prisma/        schema.prisma (gerado), seed.ts
scripts/       create-api-key.ts (CLI bootstrap)
docker/        postgres/init/01-schema.sql (DDL do banco)
tests/         helpers/ smoke/ unit/
prisma.config.ts  # Config da Prisma CLI (connection string p/ db pull/migrate)
```

### Endpoints

| Recurso         | Rotas                                                                                        | Scopes                            |
| --------------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| Health          | `GET /health`, `GET /health/ready`                                                           | _(público)_                       |
| Auth            | `POST /auth/validate`                                                                        | `auth:validate`                   |
| Users           | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`                                             | `users:read/write/delete`         |
| API Keys        | `GET/POST /api-keys`, `GET/PATCH/DELETE /api-keys/:id`                                       | `api-keys:read/write/delete`      |
| BUs             | `GET/POST /bus`, `GET /bus/tree`, `GET/PATCH/DELETE /bus/:id`                                | `bus:read/write/delete`           |
| Squads          | `GET/POST /squads`, `GET/PATCH/DELETE /squads/:id`                                           | `squads:read/write/delete`        |
| Departments     | `GET/POST /departments`, `GET/PATCH/DELETE /departments/:id`                                 | `departments:read/write/delete`   |
| Positions       | `GET/POST /positions`, `GET/PATCH/DELETE /positions/:id`                                     | `positions:read/write/delete`     |
| Bands           | `GET/POST /bands`, `GET/PATCH/DELETE /bands/:id`                                             | `bands:read/write/delete`         |
| Systems         | `GET/POST /systems`, `GET/PATCH/DELETE /systems/:id`                                         | `systems:read/write/delete`       |
| Systems ↔ Users | `GET/POST /systems/:id/users`, `DELETE /systems/:id/users/:userId`, `GET /users/:id/systems` | `systems-users:read/write/delete` |
| Systems ↔ BUs   | `GET/POST /systems/:id/bus`, `DELETE /systems/:id/bus/:buId`, `GET /bus/:id/systems`         | `systems-bus:read/write/delete`   |
| Access logs     | `GET /systems/:id/access-logs`, `GET /users/:id/access-logs`                                 | `access-logs:read`                |

O super-scope **`admin:*`** libera tudo; **`<recurso>:*`** (ex: `users:*`) libera todas as ações
do recurso.

**Envelope de resposta:**

```jsonc
// item único
{ "data": { ... } }
// lista
{ "data": [ ... ], "meta": { "total": 150, "page": 1, "perPage": 20 } }
// erro
{ "error": { "code": "USER_NOT_FOUND", "message": "...", "details": { } } }
```

---

## 7. Como criar uma nova API Key

A criação de keys pela API (`POST /api-keys`) exige uma key com scope `api-keys:write` — então a
**primeira** key (bootstrap) é criada via CLI:

```bash
# Bootstrap: cria um sistema novo + uma key admin
npm run key:create -- --system-name="Meu Sistema" --name="key-admin" --scopes=admin:*

# Ou para um sistema existente, com scopes específicos
npm run key:create -- --system-id=1 --name="App Web" --scopes=users:read,users:write,auth:validate
```

A **key crua é exibida uma única vez** (no banco fica só o hash SHA-256). Os clientes a enviam no
header `X-API-Key`. Depois disso, novas keys podem ser criadas via `POST /api-keys`:

```bash
curl -X POST http://localhost:3000/api-keys \
  -H "X-API-Key: 3fc_dev_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "system_id": 1, "name": "App Mobile", "scopes": ["auth:validate"], "created_by": 1 }'
```

---

## 8. Como adicionar um novo endpoint/módulo

Exemplo: um recurso fictício `widgets`.

1. **Crie a pasta** `src/modules/widgets/` com 4 arquivos:
   - `schema.ts` — schemas Zod (`createWidgetSchema`, `updateWidgetSchema`, params, query).
   - `service.ts` — lógica de dados (usa `prisma.<model>`); valida FKs com os helpers de
     `utils/references.ts` quando houver `created_by`/relacionamentos.
   - `controller.ts` — funções finas: fazem `schema.parse(...)`, chamam o service e respondem com
     `sendItem` / `sendList`.
   - `routes.ts` — declara as rotas com `requireScope(...)`.
2. **Adicione os scopes** em `src/config/scopes.ts` (`widgetsRead`, `widgetsWrite`, ...).
3. **Monte o router** em `src/routes.ts` (`apiRouter.use(widgetsRouter)`).
4. `npm run typecheck && npm test`.

> Use os módulos existentes (`departments` é o mais simples, `users` o mais completo) como
> molde. Handlers `async` podem **lançar** erros livremente — o Express 5 encaminha promises
> rejeitadas ao `error-handler`.

---

## 9. Deploy em produção

1. **Build:**
   ```bash
   npm ci
   npm run build
   npm run prisma:generate   # garante o client no servidor
   ```
2. **Variáveis:** `NODE_ENV=production`, `LOG_PRETTY=false`, `TRUST_PROXY=true`, `DATABASE_URL`
   apontando para o IP interno da VPS do banco, `API_KEY_PREFIX=3fc_live_`.
3. **PM2:**
   ```bash
   pm2 start dist/server.js --name 3f-core-api --time
   pm2 save && pm2 startup
   ```
4. **Nginx (reverse proxy + HTTPS):** o TLS termina no Nginx/Caddy (esta API só fala HTTP local).
   ```nginx
   server {
     server_name core.3fventure.com.br;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
     # ... certificados (Let's Encrypt) ...
   }
   ```
   Com `TRUST_PROXY=true`, o Express confia no `X-Forwarded-*` (IP real no log/rate limit).
5. **Firewall (UFW):** exponha só o necessário e restrinja o banco aos IPs das VPS autorizadas.
   ```bash
   # Na VPS da API
   ufw allow 22/tcp
   ufw allow 80,443/tcp
   ufw enable
   # Na VPS do banco — só aceita Postgres das VPS autorizadas
   ufw allow from <IP_DA_VPS_API> to any port 5432 proto tcp
   ufw deny 5432/tcp
   ```

---

## 10. Troubleshooting

| Sintoma                                                      | Causa / Solução                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `Variáveis de ambiente inválidas` no boot                    | Falta/erro em variável do `.env`. A mensagem lista o que está errado. Veja `.env.example`.                  |
| `The datasource property url is no longer supported` (P1012) | Prisma 7: a connection string vai em `prisma.config.ts`, não no `schema.prisma`. Já está configurado.       |
| `prisma db pull` trava / `Can't reach database server`       | Túnel SSH caiu ou Docker não subiu. Confirme a porta (`5433` túnel / `5432` Docker) e o `DATABASE_URL`.     |
| Erro de adapter / `PrismaClient` não conecta                 | Rode `npm install` (precisa de `@prisma/adapter-pg` + `pg`) e `npm run prisma:generate`.                    |
| `401 API_KEY_MISSING`                                        | Faltou o header `X-API-Key`.                                                                                |
| `403 INSUFFICIENT_SCOPE`                                     | A key não tem o scope exigido pela rota. Veja a tabela de endpoints (seção 6).                              |
| `403 NO_SYSTEM_ACCESS` no `/auth/validate`                   | O usuário existe mas não está vinculado ao sistema da key. Vincule via `POST /systems/:id/users`.           |
| `429 RATE_LIMITED`                                           | Excedeu o rate limit (padrão 100/min por key). Ajuste `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`.            |
| Tests falham por falta de banco                              | Os smoke/unit tests são hermético (não tocam o banco). Se falhar no boot, confirme que `npm install` rodou. |
