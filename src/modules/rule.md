# rule.md — pasta `modules/`

Guia da camada de módulos: **o padrão comum** a todos e o **índice** dos módulos. Para o detalhe de
cada um, abra o `rule.md` dentro da pasta do módulo. Para o contexto geral do projeto, ver o
`CLAUDE.md` da raiz.

## O padrão de módulo

Cada módulo vive em `src/modules/<nome>/` e segue sempre a mesma cadeia:

```
routes.ts  →  controller.ts  →  service.ts  →  schema.ts
```

- **`routes.ts`** — declara as rotas e amarra cada uma a um scope com `requireScope(SCOPES.x)`.
  Exporta `<nome>Router`, registrado em `src/routes.ts`. Rotas usam **caminho absoluto** (`/users`),
  e rotas específicas vêm **antes** das paramétricas (ex.: `/api-keys/types` antes de `/api-keys/:id`).
- **`controller.ts`** — fino: faz `schema.parse(req.body/params/query)`, chama o service e responde
  com `sendItem` / `sendList`. **Sem lógica de dados.** Pode lançar (Express 5 captura no error-handler).
- **`service.ts`** — toda a lógica de dados e regras de negócio. Acessa o Prisma, valida referências
  (`utils/references.ts`), aplica `omit` de segredos, lança as classes de `utils/errors.ts`.
- **`schema.ts`** — schemas Zod de entrada (create/update/params/query) e os tipos inferidos
  (`z.infer`). É a fronteira de validação; o resto do módulo confia no tipo já parseado.

## Convenções que valem pra todo módulo

- **Respostas:** `sendItem(res, data, status?)` e `sendList(res, data, buildMeta(total, query))`
  (`utils/http.js`). Paginação via `paginationQuerySchema` + `toSkipTake` (`utils/pagination.js`).
- **Erros:** lance `NotFoundError`/`ConflictError`/etc. (`utils/errors.js`). O `error-handler` mapeia
  ZodError → 400 e erros do Prisma (P2002→409, P2025→404, P2003→409). 5xx não vazam mensagem interna.
- **Segredos:** `password` e `key_hash` **nunca** saem das respostas (use `omit`).
- **Acesso a dados:** models snake_case (`prisma.api_key`, `systems_users`). Nomes de relação são
  feios/ambíguos — prefira ids escalares e filtros `where` por relação; evite `include` frágil.
- **Auth:** todas as rotas (exceto `health`) passam por `apiKeyAuth` + `requireScope`. Catálogo de
  scopes em `src/config/scopes.ts`.
- **CRUD padrão:** `DELETE` = hard delete; `is_active` é soft-disable independente (via `PATCH`).

## Índice de módulos

| Módulo | Faz | rule.md |
|---|---|---|
| `auth` | Valida credenciais (`POST /auth/validate`) e registra acesso em `systems_users_access`. Única lógica de autenticação de usuário. | `auth/rule.md` |
| `users` | CRUD de usuários + vínculo N:N com BU (`users_bus`). Recurso central de identidade. | `users/rule.md` |
| `api-keys` | CRUD de API Keys, tipos (`adm`/`login`), geração show-once. | `api-keys/rule.md` |
| `bus` | CRUD de Business Units; árvore hierárquica via `parent_id`. | `bus/rule.md` |
| `squads` | CRUD de squads; `leader_id` obrigatório no create. | `squads/rule.md` |
| `departments` | CRUD de departamentos. | `departments/rule.md` |
| `positions` | CRUD de cargos (`position` é palavra reservada em SQL). | `positions/rule.md` |
| `bands` | CRUD de bands/faixas. | `bands/rule.md` |
| `systems` | CRUD do catálogo de sistemas consumidores. | `systems/rule.md` |
| `systems-users` | Vínculo N:N user↔system (+ `role` por sistema). | `systems-users/rule.md` |
| `systems-bus` | Vínculo N:N system↔bu. | `systems-bus/rule.md` |
| `access-logs` | Leitura dos logs de acesso (`id` é BigInt — serializar com `.toString()`). | `access-logs/rule.md` |
| `health` | Healthcheck. **Única rota sem auth.** | `health/rule.md` |

## Criar um módulo novo

1. Crie a pasta com os 4 arquivos no padrão acima.
2. Registre o router em `src/routes.ts`.
3. Adicione os scopes em `src/config/scopes.ts` (se for um recurso novo).
4. Crie o `rule.md` do módulo e adicione a linha aqui no índice **e** no mapa do `CLAUDE.md`.
