# rule.md — módulo `health`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

Sondas de saúde da API para load balancer, orquestrador e smoke tests:
- **liveness** (`/health`): o processo está de pé? Responde **sem tocar o banco**.
- **readiness** (`/health/ready`): a API consegue falar com o PostgreSQL?

Módulo enxuto: só `routes.ts` + `controller.ts`. **Não há `schema.ts` nem `service.ts`** (sem input
de usuário, sem lógica de dados além de um `SELECT 1`).

## Endpoints

> ⚠️ **Única rota da API SEM autenticação por API Key.** O `healthRouter` é montado em
> `app.use('/health', healthRouter)` **antes** de `app.use(apiKeyAuth)` no `app.ts`. Por isso `/health`
> e `/health/ready` **não** exigem header `X-API-Key` nem scope. Ao mexer no `app.ts`, mantenha o
> health montado antes do `apiKeyAuth`, senão as sondas passam a exigir credencial e quebram o
> load balancer.

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | **nenhuma** | Liveness — não toca o banco |
| GET | `/health/ready` | **nenhuma** | Readiness — verifica conectividade com o PostgreSQL |

## Schema (Zod)

Não há — nenhum dos endpoints recebe params, query ou body.

## Service

Não há `service.ts`. A única chamada a banco (`prisma.$queryRaw\`SELECT 1\``) fica direto no
controller `ready`.

## Controller — `controller.ts`

- **`health(_req, res)`** (síncrono): responde `200` com
  `{ data: { status: 'ok', service: 'api-universal-login', uptime_s, timestamp } }`.
  `uptime_s` = `Math.round(process.uptime())`; `timestamp` = ISO atual. **Não** consulta o banco.
- **`ready(_req, res)`** (async): roda `prisma.$queryRaw\`SELECT 1\``. Sucesso → `200`
  `{ data: { status: 'ready', database: 'up' } }`. Falha → `503`
  `{ error: { code: 'NOT_READY', message: 'Banco de dados indisponível.' } }`.

## Erros

- `503 NOT_READY` — apenas em `/health/ready`, quando o `SELECT 1` falha (banco fora do ar). Tratado
  localmente no `try/catch` do controller, não passa pelo `error-handler`.
- `/health` não tem caminho de erro próprio (responde sempre `200`).

## Gotchas

- **Sem API Key:** é a única exceção à regra global de autenticação. Não adicione `requireScope` nem
  espere `req.system` aqui — o `apiKeyAuth` nem rodou.
- **Liveness ≠ readiness:** `/health` deve continuar **sem** tocar o banco (load balancer não pode
  derrubar o pod só porque o Postgres piscou). A checagem de banco é exclusiva de `/health/ready`.
- O `503` do `ready` é montado à mão (não usa as classes de `utils/errors.js`), mas segue o mesmo
  envelope `{ error: { code, message } }` do `error-handler`.
