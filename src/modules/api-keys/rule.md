# rule.md — módulo `api-keys`

Aprofundamento do módulo. Para o contexto geral do projeto e a política de `rule.md`, ver o
`CLAUDE.md` da raiz.

## Responsabilidade

CRUD das **API Keys** que os sistemas consumidores usam pra autenticar (`X-API-Key`). Cada key
pertence a um `system` e carrega um array de `scopes` que define o que ela pode acessar. Este módulo
**gera** a key (retornando a versão crua uma única vez), **lista/consulta**, **edita** (nome, tipo,
ativar/desativar, expiração) e **exclui**.

> A *validação* da key em cada request **não** está aqui — fica no middleware `src/middleware/api-key.ts`.
> Este módulo só administra o ciclo de vida das keys.

## Conceito central: "tipo" de key

O cliente **nunca manda scopes crus**. Ele escolhe um **tipo** e a API expande nos scopes corretos.
A regra de permissão é centralizada em `src/config/scopes.ts` (`API_KEY_TYPES`), não nos consumidores.

| `type` | Scopes que libera | Uso |
|---|---|---|
| `adm` | `admin:*` | Acesso total à API (ferramentas internas de gestão) |
| `login` | `auth:validate`, `users:read`, `bus:read`, `systems:read`, `positions:read`, `departments:read`, `bands:read`, `squads:read` | Sistema de login: valida credenciais + lê perfil completo |

**Adicionar um tipo novo:** acrescente uma entrada em `API_KEY_TYPES` no `scopes.ts`. Schema Zod
(`API_KEY_TYPE_NAMES`), validação e o endpoint `/api-keys/types` se ajustam sozinhos — nada a mudar aqui.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/api-keys` | `api-keys:read` | Lista (filtro `is_active`; paginado) |
| GET | `/api-keys/types` | `api-keys:read` | Catálogo de tipos disponíveis (pro front montar seletor) |
| GET | `/api-keys/:id` | `api-keys:read` | Uma key |
| POST | `/api-keys` | `api-keys:write` | Gera key (retorna a crua **uma vez**) |
| PATCH | `/api-keys/:id` | `api-keys:write` | Edita nome/tipo/is_active/expires_at |
| DELETE | `/api-keys/:id` | `api-keys:delete` | **Hard delete** |

> ⚠️ **Ordem das rotas:** `/api-keys/types` é registrada **antes** de `/api-keys/:id`, senão o param
> `:id` captura `"types"`. Mantenha essa ordem ao mexer no `routes.ts`.

## Schema (Zod) — `schema.ts`

- **create** (`createApiKeySchema`): `system_id` (obrigatório), `name` (1–150 chars, obrigatório),
  `type` (`adm`|`login`, obrigatório), `created_by` (opcional, **não** aceita `null`), `expires_at`
  (`.nullish()` — aceita `null` = nunca expira).
- **update** (`updateApiKeySchema`): todos opcionais — `name`, `type`, `is_active`, `expires_at`
  (aceita `null` pra remover a expiração).
- **list query**: `is_active` (`"true"`/`"false"` → boolean), `page`, `perPage`. Filtrar por
  `system_id` não é param (convenção do `CLAUDE.md`) — vira rota dedicada.
- O enum de tipos vem de `API_KEY_TYPE_NAMES` (derivado do catálogo) — **não** hardcode `['adm','login']`.

## Service — `service.ts`

- `SAFE_OMIT = { key_hash: true }` em **toda** leitura/escrita: o hash nunca sai do service.
- `create`: valida `system_id` (e `created_by`, se vier) via `utils/references.ts`; gera a key
  (`utils/api-key-generator.ts`); persiste `scopes = scopesForType(type)`, `key_hash`, `key_prefix`;
  retorna `{ apiKey, plainKey }`. **`plainKey` é a única vez que a key crua existe.**
- `update`: mudar `type` **regenera os scopes** a partir do catálogo (não toca na key crua nem no hash).
- `remove`: hard delete (`prisma.api_key.delete`).
- `listTypes`: devolve o catálogo (`type`, `label`, `description`, `scopes`).
- **`withType(apiKey)`**: helper que anexa o campo derivado **`type`** (via `typeForScopes`) em toda
  resposta de `list`/`getById`/`create`/`update`, pro front exibir "Login"/"Administrador" sem
  reprocessar scopes. Retorna `type: null` se os scopes não baterem com nenhum tipo conhecido
  (key antiga/customizada) → nesse caso o front mostra os `scopes` crus.

## Regras de negócio / decisões travadas

- **CRUD livre:** não há limite de keys por sistema; um sistema pode ter várias keys de qualquer tipo.
  (Considerou-se "1 por sistema com revogação automática" e foi **descartado** — risco de lockout na
  troca. Rotação é manual: cria a nova, atualiza o `.env`, testa, exclui a velha.)
- **Show-once:** a key crua (`key`) só aparece no retorno do `POST`. Em `GET` só vem `key_prefix`
  (12 chars) + metadados. Perdeu a key → não recupera, só gera outra.
- **`created_by` vem do body** (opcional aqui; coluna nullable no banco).
- **Expiração opcional, default eterno:** sem `expires_at`, a key nunca expira (keys estáticas). Se
  preenchido, o middleware barra após a data (`401 API_KEY_EXPIRED`).
- **`is_active` vs DELETE:** `PATCH { is_active: false }` revoga sem apagar (religável); `DELETE`
  remove de vez. Alinhado com a regra global (DELETE = hard delete; `is_active` = soft-disable).
- **`name`** vem do front, editável a qualquer momento via `PATCH` sem efeito colateral na key/scopes.

## Erros

- `400` — body/query inválidos (ex.: `type` fora de `adm`/`login`, `system_id` ausente) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token não tem o scope da rota.
- `404` — `API_KEY_NOT_FOUND` (id inexistente) ou `SYSTEM_NOT_FOUND`/`CREATED_BY_NOT_FOUND` no create.

## Gotchas

- Nunca devolver `key_hash` (sempre `SAFE_OMIT`). A key crua só no `create`.
- Manter `/api-keys/types` antes de `/api-keys/:id` no `routes.ts`.
- Ao criar via script de bootstrap (`scripts/create-api-key.ts`) o caminho é **outro** (monta scopes
  direto, não passa por este schema) — resolve o "ovo e galinha" da primeira key.
