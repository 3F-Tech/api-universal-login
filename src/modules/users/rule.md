# rule.md — módulo `users`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD de **usuários** — o recurso central de identidade. Inclui a gestão do vínculo **N:N com BUs**
(tabela `users_bus`), que substituiu a antiga coluna `user.bu_id`. Toda resposta de usuário embute
o array `bus` (as BUs vinculadas, cada uma com `from_squad`).

## Endpoints

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/users` | `users:read` | Lista **LEVE** (sem `profile_picture`) + `bus`; só `is_active` + paginação |
| GET | `/users/photos` | `users:read` | **Fotos em lote**: `?ids=1,2,3` → mapa `{ id: profile_picture }` |
| GET | `/users/:id` | `users:read` | Um usuário (+ `bus`, **com** `profile_picture`) |
| POST | `/users` | `users:write` | Cria usuário (+ vínculos de BU opcionais) |
| PATCH | `/users/:id` | `users:write` | Atualiza (campos parciais; pode substituir `bus`) |
| DELETE | `/users/:id` | `users:delete` | **Hard delete** (vínculos `users_bus` caem por CASCADE) |

## Schema (Zod) — `schema.ts`

- **create** (`createUserSchema`): obrigatórios `name`, `email` (lowercase), `password` (8–72),
  `role`. Opcionais: dados pessoais (cpf, cnpj, phone, instagram…), endereço, FKs (`department_id`,
  `position_id`, `band_id`, `squad_id`) e `bus` (array de vínculos). Todos os campos opcionais
  (exceto `bus`) usam `.nullish()` — o cliente pode mandar `null` em vez de omitir; `null` grava
  `null` na coluna (ver convenção em `../rule.md`).
- **update** (`updateUserSchema`): `createUserSchema.partial()` — tudo opcional.
- **bus link** (`busLinkSchema`): `{ bu_id, from_squad? = false }`. **`from_squad` vem do FRONT** —
  é o front que identifica a BU do squad e marca `true`; as demais ficam `false`. A API só persiste,
  **não** sincroniza com `squad.bu_id`.
- **list query** (`listUsersQuerySchema`): só `is_active` + `page`/`perPage` (convenção de params do
  CLAUDE.md). Os filtros antigos (`bu_id`, `q`, `department_id`) viraram/virarão rotas dedicadas; o
  `squad_id` sobrevive como filtro **interno** (`UserListFilters`), usado pela rota `GET /squads/:id/users`.
- **photos query** (`userPhotosQuerySchema`): `ids` = CSV de inteiros positivos na query
  (`?ids=1,2,3`), **deduplicado** e limitado a **`MAX_PHOTO_IDS` (50)** por requisição.

## Regras de negócio

- **Vínculos de BU (`bus`):**
  - No **create**: presente grava os vínculos; ausente = nenhum.
  - No **update**: presente **substitui o conjunto inteiro** (deleta todos e recria); ausente = não mexe.
  - Sempre **deduplicados** por `bu_id` (último vence) via `normalizeBus`, pra não violar o
    `UNIQUE (user_id, bu_id)`.
  - Cada `bu_id` é validado antes (`assertBuExists`) → `404` limpo em vez de `P2003` cru.
- **Senha:** hasheada com bcrypt no create e, no update, só se `password` vier preenchido.
- **Escrita transacional:** create/update usam `prisma.$transaction` — usuário + vínculos numa só
  unidade.

## Service — `service.ts`

- `SAFE_OMIT = { password: true }` em `getById`/`create`/`update`. `LIST_OMIT = { password,
  profile_picture }` **só na listagem** — ver "Fotos de perfil (perf)" abaixo.
- `fetchUserBus(client, userId)` — BUs de UM usuário (cada uma com `from_squad`).
- `fetchBusByUser(userIds[])` — BUs de VÁRIOS em **2 queries** (vínculos + BUs por `id IN (...)`),
  **sem N+1**. Não usa relação no `select`: com o `adapter-pg`, `select: { bu: true }` dispara uma
  query por linha — era um dos gargalos da listagem.
- `listPhotos(ids[])` — fotos em lote numa query (`id IN (...)`), devolve mapa `{ id → profile_picture }`
  (só ids existentes; foto pode ser `null`).
- `list` embute `bus` em cada usuário via o Map acima; `getById`/`create`/`update` via `fetchUserBus`.
- `remove` = hard delete (vínculos somem por `ON DELETE CASCADE`).

## Fotos de perfil (perf)

`profile_picture` guarda a imagem como **base64 inline** no banco (média ~1,6 MB, máx. 2,5 MB; ~31 MB
no total). Puxar isso na listagem levava o `GET /users` a **~5,5 s**. Design atual:

- `GET /users` **não** manda `profile_picture` (`LIST_OMIT`) → lista cai pra ~300 ms.
- O front pagina (~30/página), renderiza os cards leves e **depois** busca as fotos da página visível
  (ou dos resultados de uma busca) em **uma** requisição: `GET /users/photos?ids=...`.
- É `GET` (não `POST`) de propósito: navegador só cacheia `GET`. A rota manda `Cache-Control:
  private, max-age=300`. No **Cenário 2** (browser → servidor do front → API) quem fala com o
  navegador é o front, então o header de cache efetivo é configurado lá.
- **Caminho definitivo** (não feito): mover imagens pra object storage/CDN e guardar só a URL — tira
  os bytes do banco e da API de vez. A rota em lote é a mitigação até isso existir.

## Erros

`USER_NOT_FOUND` (404). BU inexistente nos vínculos → `404` (via `assertBuExists`). Email/cpf/cnpj
duplicados → `409` (P2002, pelo error-handler).

## Gotchas

- Nunca retornar `password`.
- `from_squad` é responsabilidade do front — não inferir no backend.
- Em `update`, mandar `bus: []` **apaga** todos os vínculos; omitir `bus` os preserva. São coisas
  diferentes.
- `GET /users` **não** retorna `profile_picture` — só `/users/:id` e `/users/photos`. Pra foto numa
  lista, o front busca via `GET /users/photos?ids=...` depois de renderizar os cards.
- A rota `/users/photos` fica registrada **antes** de `/users/:id` no router — senão `"photos"`
  casaria como `:id` e cairia no parse numérico (400).
