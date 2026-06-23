# CLAUDE.md

Guia para agentes (Claude Code) trabalhando neste repositório. Leia antes de editar.

## O que é

**3F Core API** (`api-universal-login`): API de identidade centralizada da 3F Venture. Backend-to-backend,
autenticada por **API Key** (`X-API-Key`) com autorização por **scopes**. PostgreSQL é a fonte da
verdade; o schema do Prisma é **introspectado**, nunca escrito à mão.

## Comandos

```bash
npm run dev          # desenvolvimento (tsx watch)
npm run typecheck    # tsc --noEmit  (rode SEMPRE após mudar tipos)
npm test             # Vitest (smoke + unit, hermético — não toca o banco)
npm run lint         # ESLint (flat config)
npm run build        # compila para dist/
npm run prisma:pull && npm run prisma:generate   # após mudanças no banco
```

Antes de concluir qualquer tarefa de código: **`npm run typecheck && npm run lint && npm test`**.

## Decisões travadas (NÃO reverter sem pedir)

- **Express 5** — tratamento de erro async é nativo: handlers `async` podem **lançar** (`throw new
NotFoundError(...)`) que o `error-handler` captura. Não criar wrapper `asyncHandler`. `req.query`
  é read-only.
- **ESM / NodeNext** — `package.json` tem `"type": "module"`. **Todo import relativo usa extensão
  `.js`** (ex: `import { env } from '../config/env.js'`), mesmo apontando para um `.ts`.
- **Prisma 7** (mudou bastante vs. 6):
  - **Sem `url` no `schema.prisma`.** A connection string da CLI fica em `prisma.config.ts`
    (`datasource.url`); em runtime quem conecta é o **driver adapter** `@prisma/adapter-pg` em
    `src/config/database.ts`. Reintroduzir `url` no schema quebra (`P1012`).
  - **`prisma db pull` exige banco vivo** (Docker local na 5432 ou túnel SSH na 5433). Sem isso,
    não há models nem client tipado.
  - **Models são gerados por introspecção.** NÃO criar/editar models à mão nem rodar migrations
    que criem tabelas.
- **DELETE = exclusão real** (hard delete). `is_active` é **independente** e mexido só via
  `PATCH { is_active }` (soft-disable, não soft-delete).
- **Campos nullable no banco aceitam `null`:** todo campo opcional cuja coluna é *nullable* usa
  `.nullish()` no Zod (cliente pode mandar `null` em vez de omitir; `null` grava `null`/limpa o
  vínculo). Exceções que seguem `.optional()` sem aceitar `null`: `created_by` e `leader_id`
  (exigidos apesar de nullable) e colunas `NOT NULL`. Guard de FK nullable antes do Prisma usa
  `!= null`, não `!== undefined`.
- **`created_by` / `leader_id` vêm do body** e são **obrigatórios no create** de `department`,
  `position`, `band`, `api_key` e `squad` (leader_id). A coluna é nullable no banco, mas o Zod
  exige. Validar que o user existe antes (`utils/references.ts`) para erro 404 limpo.
- **`/auth/validate`:** user inexistente → 401 (sem log); sem vínculo em `systems_users` → 403
  (sem log); conta inativa ou senha errada (com vínculo) → log `success=false` + 403/401; sucesso
  → log `success=true` + retorna o user (sem `password`).
- **Scopes:** `admin:*` libera tudo; `<recurso>:*` libera o recurso; senão match exato. Catálogo
  em `src/config/scopes.ts`.

## Convenções de código

- **Padrão de módulo** (`src/modules/<nome>/`): `routes.ts` → `controller.ts` → `service.ts` →
  `schema.ts`. Controllers são finos (parse Zod + chama service + `sendItem`/`sendList`). Lógica
  de dados fica no service. Rotas com `requireScope(...)`.
- **Respostas:** use `sendItem(res, data, status?)` e `sendList(res, data, buildMeta(total, query))`
  de `utils/http.js`. Paginação via `paginationQuerySchema` + `toSkipTake` (`utils/pagination.js`).
- **Erros:** lance as classes de `utils/errors.js` (`NotFoundError`, `ConflictError`, etc.). O
  `error-handler` mapeia ZodError → 400 e erros conhecidos do Prisma (P2002→409, P2025→404,
  P2003→409). 5xx não vazam mensagem interna.
- **Acesso a dados:** os models introspectados usam **nomes snake_case** (`prisma.api_key`,
  `prisma.systems_users`, campos `created_at`, `system_id`...). Os **nomes de relação são feios e
  desambiguados** (ex: `user_band_created_byTouser`, `buTobu`). **Prefira campos escalares / ids
  explícitos e filtros `where` por relação** (`{ systems_users: { some: { system_id } } }`); evite
  `include` com nomes de relação frágeis.
- **Nunca exponha segredos:** `password` (use `omit: { password: true }`) e `key_hash`
  (`omit: { key_hash: true }`) ficam fora das respostas. O logger (`utils/logger.ts`) já faz redact.
- **BigInt:** `systems_users_access.id` é `BigInt` — serialize com `.toString()` (ver
  `modules/access-logs/service.ts`), senão `JSON.stringify` quebra.
- **TypeScript:** `strict` + `noUncheckedIndexedAccess`. Sem `any` sem justificativa em comentário.
- **Cross-platform:** scripts npm portáveis (use `cross-env` p/ env vars). Sem paths com `/`/`\`
  hardcoded — `path.join`.

## Regras locais (`rule.md`)

O contexto transversal (config, middleware, utils, bootstrap) está **neste arquivo**. O **padrão de
módulo** (cadeia `routes→controller→service→schema`, convenções comuns e índice) está em
**`src/modules/rule.md`**. O detalhe de cada módulo de negócio vive num **`rule.md` dentro da pasta
do módulo** (`src/modules/<nome>/rule.md`): endpoints, schema Zod, regras de negócio, erros e gotchas.
A ideia é que qualquer agente pegue o contexto completo lendo só os `.md`, sem precisar abrir o código.

**Política (obrigatória):**

1. **Antes de codar** num módulo, leia o `rule.md` dele.
2. **Depois de mudar** algo relevante (endpoint, schema, regra), atualize o `rule.md` local na mesma tarefa.
3. **Módulo novo:** crie o `rule.md` e adicione a linha no mapa abaixo.

### Mapa de `rule.md`

| Módulo | Caminho | Responsabilidade |
|---|---|---|
| auth | `src/modules/auth/rule.md` | Valida credenciais (`/auth/validate`) e registra acesso em `systems_users_access` |
| users | `src/modules/users/rule.md` | CRUD de usuários (+ vínculo N:N com BU via `users_bus`) |
| api-keys | `src/modules/api-keys/rule.md` | CRUD de API Keys, tipos (`adm`/`login`) e geração show-once |
| bus | `src/modules/bus/rule.md` | CRUD de Business Units (árvore via `parent_id`) |
| squads | `src/modules/squads/rule.md` | CRUD de squads (`leader_id` obrigatório) |
| departments | `src/modules/departments/rule.md` | CRUD de departamentos |
| positions | `src/modules/positions/rule.md` | CRUD de cargos (`position`, nome reservado em SQL) |
| bands | `src/modules/bands/rule.md` | CRUD de bands/faixas |
| systems | `src/modules/systems/rule.md` | CRUD do catálogo de sistemas consumidores |
| systems-users | `src/modules/systems-users/rule.md` | Vínculo N:N user↔system (+ `role` por sistema) |
| systems-bus | `src/modules/systems-bus/rule.md` | Vínculo N:N system↔bu |
| access-logs | `src/modules/access-logs/rule.md` | Leitura dos logs de acesso (`id` é BigInt) |
| health | `src/modules/health/rule.md` | Healthcheck (única rota sem auth) |

## Testes

`tests/` é hermético: `tests/setup.ts` injeta um `DATABASE_URL` dummy e desliga o pretty-log, então
os smoke tests (app boot, `/health`, proteção por API key) e unit tests **não tocam o banco**.
Testes de integração contra Postgres ficam como evolução (factories já em `tests/helpers`).

## Não faça

- Não rode migrations Prisma que criem/alterem tabelas (banco é a fonte da verdade).
- Não use CORS aberto (`*`). CORS só via `CORS_ORIGINS` explícito.
- Não logue senhas, keys cruas ou hashes.
- Não commite `.env` (só `.env.example`).
- Não hardcode credenciais/URLs/IPs — tudo via `env` validado (`src/config/env.ts`).
