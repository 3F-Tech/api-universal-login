# rule.md — módulo `clients`

Aprofundamento do módulo. Padrão comum em `src/modules/rule.md`; contexto geral no `CLAUDE.md`.

## Responsabilidade

CRUD (sem hard delete) de **clientes** (`client`) — recurso promovido do sistema de gestão de
contratos (`sistema_gestao.clients`) para a Core em 2026-07, porque quase todos os sistemas
internos passaram a precisar de dados de cliente. Segue o mesmo padrão de identidade-na-Core +
overlay-local já usado para `user`↔`sellers` e `bu`↔`bu_settings`: a Core guarda a identidade
(`client`), o sistema de gestão guarda o que só ele usa (`client_settings` — `contact_id`,
`is_delinquent`, `squad_id_manual`). Este módulo administra **só** o lado Core.

**Os IDs não mudaram na migração** — os 293 registros originais foram copiados com os mesmos ids
(sem crosswalk), então FKs antigas em `contracts.client_id`/`contract_churns.client_id`/
`spiced.client_id` (no `sistema_gestao`) ainda apontam para os valores certos, mesmo sem FK real
entre bancos.

## Endpoints

Todos exigem header `X-API-Key`. Scope por rota (ver `routes.ts`):

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| GET | `/clients` | `clients:read` | Lista (filtro `is_active`; paginado). **Sem `logo_picture`** |
| GET | `/clients/search` | `clients:read` | Busca por `name`/`document` (ILIKE), paginado |
| GET | `/clients/by-document/:document` | `clients:read` | Lookup pela chave natural (`document` é `UNIQUE`) |
| GET | `/clients/:id` | `clients:read` | Registro completo, **com** `logo_picture` |
| POST | `/clients/batch` | `clients:read` | `{ ids: number[] }` → clientes correspondentes (mata o N+1 do sistema_gestao). **Sem `logo_picture`** |
| POST | `/clients` | `clients:write` | Cria |
| PATCH | `/clients/:id` | `clients:write` | Atualiza (parcial) |
| POST | `/clients/assign-specialist` | `clients:write` | Atribui/desvincula especialista a VÁRIOS clientes de uma vez (carteira) |
| GET | `/squads/:squadId/clients` | `clients:read` | Clientes de um squad (via `client.squad_id`) |
| GET | `/users/:userId/clients` | `clients:read` | Clientes atendidos por um especialista (via `client.specialist_id`) |

> ⚠️ **Sem `DELETE`.** Churn é histórico financeiro; `contract_churns.client_id`/
> `spiced.client_id` no `sistema_gestao` **não têm FK real** contra a Core (Postgres não faz FK
> entre bancos). Apagar um cliente aqui deixaria esses registros órfãos em silêncio. Desativação é
> só `PATCH { is_active: false }`.
>
> ⚠️ **Ordem das rotas:** `/clients/search`, `/clients/by-document/:document` e (POST)
> `/clients/batch` são registradas **antes** de `/clients/:id` — senão o `:id` captura esses
> segmentos. Mantenha essa ordem ao mexer no `routes.ts`.
>
> ⚠️ **`POST /clients/batch` usa scope `clients:read`**, não `clients:write` — apesar do verbo
> HTTP, é uma leitura em lote (body carrega o array de ids porque `GET` não comporta bem um array
> grande). Não confunda ao adicionar rotas novas aqui.

## Desvio deliberado da convenção de filtros (ver `CLAUDE.md`)

O documento de migração original pedia `status`, `squad_id`, `specialist_id` e busca por
`name`/`document` como **query params** de `GET /clients`. Isso contraria a convenção travada do
projeto (query só carrega `is_active` + paginação; todo outro filtro vira rota dedicada — decisão
confirmada explicitamente com o usuário antes de implementar). Resolução adotada:

- `squad_id` → rota `GET /squads/:squadId/clients` (mesmo padrão de `GET /users/:id/led`).
- `specialist_id` → rota `GET /users/:userId/clients`.
- Busca por `name`/`document` → rota `GET /clients/search?q=`.
- **`status` ficou de fora por ora** — não virou rota nem param. Religável depois como rota
  dedicada (ex.: `GET /clients/by-status/:status`) se/quando for pedido.

## Schema (Zod) — `schema.ts`

- **params:** `clientParamsSchema` (`id`), `clientDocumentParamSchema` (`document`, string livre),
  `squadIdParamSchema` (`squadId`), `specialistIdParamSchema` (`userId`).
- **list query** (`listClientsQuerySchema`): só `is_active` + paginação (convenção do CLAUDE.md).
- **search query** (`searchClientsQuerySchema`): paginação + `q` (1–150 chars, obrigatório).
- **batch body** (`batchClientIdsBodySchema`): `ids` — array de ids positivos, min 1, **máx
  `MAX_BATCH_CLIENTS` = 200** por requisição (bound explícito pedido no doc de migração, análogo ao
  `MAX_BATCH_USERS` de `systems-users`).
- **create** (`createClientSchema`):
  - `type` (obrigatório, `enum` `CLIENT_TYPES = ['pf', 'pj']`) e `status` (opcional, `enum`
    `CLIENT_STATUSES`, **5 valores** — ver seção própria abaixo) — o banco tem CHECK constraint pros
    dois, mas o Prisma introspecta CHECK como `varchar` cru (não vira enum do client gerado); a
    validação de valores permitidos por isso **também** precisa estar no Zod, senão um valor fora do
    enum vaza como erro cru do Postgres em vez de `400 VALIDATION_ERROR` legível.
  - `name`, `document` obrigatórios (`document` é a chave natural, `UNIQUE` no banco).
  - `common_name` (novo, 2026-07-31) — `.nullish()`, `varchar(150)` no banco. Nome comum/usual do
    cliente, distinto de `name` (razão social). Sem relação com nenhuma outra tabela.
  - Campos pessoais/endereço (`email`, `phone`, `instagram`, `cep`, `logradouro`, `numero`,
    `complement`, `bairro`, `cidade`, `uf`, `representative_name`, `representative_cpf`,
    `representative_email`, `logo_picture`) — todos `.nullish()` (nullable no banco).
  - **Os `.max()` são bound defensivo do app, não do banco:** essas colunas são `text` (sem
    limite no Postgres). Os caps foram calibrados **contra o dado real** dos 293 registros
    migrados (medido em 2026-07-30) com folga, pra um round-trip GET→PATCH do front nunca ser
    rejeitado por dado legítimo já existente. Máximos reais na época: `name` 108, `document` 14,
    `email` 42, `phone` 16, `instagram` 77, `cep` 9, `logradouro` 72, **`numero` 51**, `bairro`
    54, `cidade` 23, `uf` 2, `representative_name` 51, `representative_cpf` 11,
    `representative_email` 42, `complement` vazio. Ao apertar um cap, **meça o dado primeiro** —
    `numero` chegando a 51 chars (endereços tipo "Quadra X Lote Y") invalidou um cap de 20 que
    parecia obviamente suficiente.
  - `squad_id`/`specialist_id` — `.nullish()` (FKs nullable; `null` limpa o vínculo).
  - `created_by` — **`.optional()` sem `null`**, mas **NÃO é exigido** pela regra de negócio (ao
    contrário de `department`/`position`/`band`/`api_key`/`squad.leader_id` — `client` não está na
    lista travada do `CLAUDE.md`). Validado se enviado (404 `CREATED_BY_NOT_FOUND`).
- **update** (`updateClientSchema`): `createClientSchema.omit({ created_by: true }).partial()` —
  tudo opcional; `created_by` não é alterável via update (mesmo padrão de department/position/band).

## Regras de negócio

- **`status` × `is_active` coexistem com significados distintos** (decisão da migração, não deste
  módulo mexer): `status` = ciclo de vida comercial (`active`/`churn`/`em_cancelamento`), consultado
  pela regra de negócio; `is_active` = soft-delete do registro. Um cliente em churn é um registro
  **válido** (`is_active = true`). **Não** derive "cliente ativo" a partir de `is_active` — use
  `status`.
- **Referências validadas antes do Prisma:** `squad_id` (`assertSquadExists` → 404
  `SQUAD_NOT_FOUND`), `specialist_id` (`assertUserExists` com code `SPECIALIST_NOT_FOUND` → 404) e
  `created_by` no create (`CREATED_BY_NOT_FOUND` → 404). Segue a convenção geral do projeto (404
  limpo em vez de deixar o P2003 do Prisma vazar) — **não** os `422` sugeridos no doc de migração
  original, que não existe em nenhum outro lugar da API (ver `documentation/API.md` § Erros).
- **`document` duplicado → 409** (constraint `UNIQUE`, mapeado genericamente pelo `error-handler`
  como `P2002` → `409 CONFLICT` com `details.target`; não há tratamento manual aqui, igual a
  `bu.slug`).
- **`logo_picture` nunca aparece em listagem/busca/batch** (`LIST_OMIT`), só em `GET /clients/:id` —
  mesmo motivo do `profile_picture` de `user`: o formato previsto é base64 inline, que arrastaria a
  imagem inteira em qualquer resposta de múltiplos registros. **Hoje a omissão é preventiva:** a
  coluna está **vazia nos 293 registros** (verificado em 2026-07-30), então ainda não há custo real
  — mas o contrato já nasce certo pra quando começar a ser populada. O plano acordado (não feito) é
  guardar caminho de arquivo em object storage/CDN em vez de base64; quando isso acontecer é troca
  de conteúdo, sem mudar schema nem contrato.
- **Sem hard delete** (ver aviso nos Endpoints acima). `DELETE` simplesmente não existe nas rotas.

## Carteira — atribuição de especialista em lote (`POST /clients/assign-specialist`)

A "carteira do especialista" é o vínculo `cliente → especialista de atendimento` (`client.specialist_id`).
A Core é a fonte da verdade; a tela de carteira (no Sistema de Gestão) reatribui **N clientes de uma vez**.
Fazer isso com `PATCH /clients/:id` seria uma chamada HTTP por cliente e estouraria o rate limit
(~100/min) — por isso existe este endpoint de lote (`service.assignSpecialist`), espelhando o padrão de
`linkUsers`/`unlinkUsers` de `systems-users`.

```
POST /clients/assign-specialist            (scope: clients:write)
{ "specialist_id": 42, "client_ids": [12, 40, 291] }   // specialist_id: null = DESVINCULAR
→ 200 { "data": { "specialist_id": 42, "updated": [12,40,291], "skipped": [], "count": 3 } }
```

- **`specialist_id: null` desvincula** todos os `client_ids` (`specialist_id → NULL`). Quando não-nulo, é
  validado **uma vez** (404 `SPECIALIST_NOT_FOUND`), não por cliente.
- **Valida "é `user`", NÃO "é Especialista".** `assertUserExists` só cobre a FK → `user`, então **qualquer**
  id de usuário (dev, admin, inativo) passa. É **de propósito**: a Core fica genérica, sem acoplar ao cargo
  "Especialista". Quem garante que o id é de um especialista real é o **backfill/atribuição do lado da
  Gestão** (valida o `position_id` do cargo antes de gravar). **Não** assuma que este endpoint filtra por
  cargo.
- **Tolerante a ids inexistentes:** `client_ids` que não existem **não** derrubam o lote — voltam em
  `skipped[]` (mesma filosofia do `POST /clients/batch`/`listByIds`). Decisão confirmada com o usuário.
- **`updated[]` = ids GRAVADOS, não "valor mudou".** Reatribuir para o mesmo especialista devolve o id em
  `updated` mesmo sem mudança real — o endpoint é **idempotente** (reatribuir não é erro).
- **Teto de `MAX_BATCH_CLIENTS` (200) ids** por requisição (reusa o bound do batch de leitura).
- Grava por id, **independentemente de `is_active`** (o chamador manda ids explícitos da própria lista).
- `updated_at` avança pelo trigger `trg_client_updated_at` — o service não toca nele (ver seção do trigger).
- **Escopo desta fase: só `specialist_id`.** `squad_id` não faz parte do payload (fase 2 — ver o pedido de
  migração da carteira).

## `status` — 5 valores, acoplados ao CHECK do banco

O ciclo de vida **comercial** do cliente. Quem manda na semântica é o Sistema de Gestão (dono do
processo); a Core só persiste e valida.

| Valor | Significado |
|---|---|
| `active` | Cliente ativo |
| `aguardando_renovacao` | Contrato perto do vencimento, em negociação de renovação |
| `em_cancelamento` | Aviso prévio em curso (janela padrão de 30 dias) |
| `churn` | Encerramento efetivado — saída comercial |
| `cancelado` | Anulação administrativa — trilha **separada** do churn (registro criado por engano, contrato anulado, duplicidade) |

> **`cancelado` ≠ `churn`.** Não somar os dois em métrica de churn: `cancelado` não é saída
> comercial, é correção de cadastro.

**Histórico:** nasceu com 3 valores (`active`/`churn`/`em_cancelamento`, os que vieram na migração).
`aguardando_renovacao` e `cancelado` foram acrescentados em 2026-07-30 a pedido do Sistema de Gestão,
que já usava 5 estados e estava tomando 400 nos dois novos. Mudança **aditiva**: nada renomeado, nada
removido, default segue `active`.

### ⚠️ Dois lugares para manter em sincronia

Não existe enum nativo no Postgres deste banco (verificado: `pg_enum` vazio). `client.status` é
`varchar(20)` + **CHECK constraint** `client_status_check`. Então o conjunto de valores válidos vive
em **dois** lugares:

1. `CLIENT_STATUSES` no `schema.ts` — validação Zod, dá o `400 VALIDATION_ERROR` legível;
2. o CHECK no banco — última linha de defesa.

**Ordem obrigatória ao acrescentar valor: CHECK primeiro, Zod depois.** Zod mais permissivo que o
CHECK faz o request passar a validação e estourar na escrita com erro cru do Postgres (o `400` limpo
vira erro genérico). O inverso (CHECK mais permissivo que o Zod) é inócuo.

```sql
ALTER TABLE client DROP CONSTRAINT client_status_check;
ALTER TABLE client ADD CONSTRAINT client_status_check
  CHECK (status IN ('active','churn','em_cancelamento','aguardando_renovacao','cancelado'));
```

> ⚠️ **`'aguardando_renovacao'` tem exatamente 20 chars e a coluna é `varchar(20)`** — cabe sem folga
> nenhuma. Qualquer status futuro mais longo exige `ALTER TABLE ... ALTER COLUMN status TYPE
> varchar(N)` antes, senão trunca/estoura.

## `updated_at` depende de trigger no banco (a tabela nasceu sem ele)

**Nenhum service da Core grava `updated_at`** — todas as tabelas dependem do trigger
`trg_<tabela>_updated_at` (função `update_updated_at_column()`, que faz só `NEW.updated_at = NOW()`).
O `update()` deste módulo segue esse padrão: espalha o input e não toca em `updated_at`.

A tabela `client` foi criada **sem** esse trigger, enquanto as 8 outras tabelas da Core sempre o
tiveram. Resultado: entre a migração e 2026-07-30, `client.updated_at` ficou **congelado** no valor de
criação — inclusive após `PATCH /clients/:id`. Corrigido em 2026-07-30:

```sql
CREATE TRIGGER trg_client_updated_at BEFORE UPDATE ON client
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

> **Não "conserte" isso gravando `updated_at` no service.** Seria divergir do padrão das outras 9
> tabelas e mascarar a ausência do trigger em qualquer tabela futura. Se `updated_at` parar de avançar,
> procure o trigger, não o código.

## Histórico da migração — o que a conciliação final encontrou

Registrado porque muda como conferir uma migração aqui. O cutover (2026-07-30) revelou que a **carga
inicial de 27/07 estava incompleta**, e nada disso apareceu nas checagens óbvias:

- **4 clientes reais faltando** na Core (ids 301–304). Foram criados na origem *depois* da carga,
  enquanto a app seguia no ar — a app **não estava parada** apesar de várias tentativas de `pm2 stop`
  (havia mais de um processo). Inseridos manualmente preservando os ids, porque **2 deles já tinham
  `contracts` apontando para si** — recriar com id novo teria órfãozado os contratos em silêncio.
- **1 divergência de `squad_id`** (cliente 298: `14` na Core, `NULL` na origem).
- **`created_at`/`updated_at` deram falso negativo.** Filtrar `WHERE created_at > <carga>` retornou 0
  mesmo havendo linhas novas (a medição foi feita antes delas existirem), e `updated_at` não avançava
  por falta do trigger. **Não confie nesses campos para detectar delta.**

**O que funcionou:** `COUNT(*)` nos dois lados + **checksum por coluna**
(`md5(string_agg(coalesce(col,'~'),'|' ORDER BY id))`). A contagem entrega *que* há divergência; o
checksum por coluna entrega *qual campo*, em uma rodada, sem recarregar nada. O checksum de linha
inteira (`md5(ROW(...)::text)`) só serve como selo final — sozinho ele não localiza nada.

Estado ao final: **297 linhas, `max(id)` 304, sequence 304**, hash idêntico nos dois bancos.

## ⚠️ As FKs de `client` são `NO ACTION` — afeta `DELETE` de OUTROS módulos

Verificado no banco em 2026-07-30 (`pg_constraint.confdeltype`): as três FKs de `client` saíram da
migração como **`NO ACTION`**, enquanto **todas** as outras FKs da Core que apontam para
`user`/`squad` são `SET NULL` (ou `CASCADE` nos pivôs):

| FK | `ON DELETE` | Resto da Core, p/ comparar |
|---|---|---|
| `client.squad_id → squad(id)` | **NO ACTION** | `user.squad_id` → `SET NULL` |
| `client.specialist_id → user(id)` | **NO ACTION** | `squad.leader_id`, `user.leader_id` → `SET NULL` |
| `client.created_by → user(id)` | **NO ACTION** | `api_key`/`band`/`department`/`position.created_by` → `SET NULL` |

Consequência prática — **`NO ACTION` bloqueia a exclusão do pai** (não anula o filho), então isso
muda o comportamento de rotas de **outros** módulos:

- **`DELETE /squads/:id`** passa a devolver **`409 FK_CONSTRAINT`** se o squad tiver algum cliente
  (`P2003` mapeado pelo `error-handler`). Já é o caso de **15 dos 293** clientes hoje, que têm
  `squad_id` preenchido. Antes de `client` existir, essa exclusão sempre passava (a FK
  `user.squad_id` é `SET NULL`).
- **`DELETE /users/:id`** passa a devolver **`409 FK_CONSTRAINT`** se o usuário for
  `specialist_id` ou `created_by` de algum cliente. **Não morde hoje** (as duas colunas estão 100%
  NULL), mas morde assim que a atribuição de especialista começar a ser usada.

**Não "consertar" isso no código.** É uma assimetria de **DDL**, e o banco é a fonte da verdade
(`CLAUDE.md`: não rodar migration/ALTER). Se o comportamento desejado for o do resto da Core
(`SET NULL`), a correção é um `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT ... ON DELETE SET
NULL` executado **no banco pelo dono do schema**, seguido de `prisma db pull`. Está registrado aqui
como pendência consciente, não como bug do módulo.

## Service — `service.ts`

- **`client.id` é BigInt (`bigserial`) no banco**, mas convertido para **`Number`** na saída
  (`serialize`), não para string. Diferente de `systems_users_access.id` (BigInt de log, sem
  significado de FK cross-sistema, por isso vira string lá): `client.id` **é** referenciado como FK
  inteira normal em `contracts`/`contract_churns`/`spiced` no `sistema_gestao`, então manter como
  `number` mantém a API consistente com todo o resto da Core. Seguro porque a sequence real está em
  ~298 hoje, muito abaixo de `Number.MAX_SAFE_INTEGER` — Prisma aceita `number` diretamente nos
  `where` de campos BigInt (`id?: bigint | number` no client gerado), então não precisa converter na
  entrada, só na saída.
- `LIST_OMIT = { logo_picture: true }` em `list`/`search`/`listByIds`/`listBySquad`/
  `listBySpecialist`. `getById`/`getByDocument`/`create`/`update` trazem o registro completo.
- `listByIds(ids)`: dedup + `findMany` com `id: { in: [...] }`, ordenado por `id` asc. **Não** erra
  em ids inexistentes — eles simplesmente saem da resposta (mesmo comportamento de
  `GET /users/photos`), porque o batch existe para hidratar uma página de contratos e um id
  ausente/inativo não deveria derrubar a página inteira.
- `listBySquad`/`listBySpecialist`: validam a âncora (`assertSquadExists`/`assertUserExists`) e
  filtram por `squad_id`/`specialist_id` — mesmo formato de resposta do `list` (paginado, sem
  `logo_picture`).
- `search(query)`: `OR` de `name`/`document` com `contains` + `mode: 'insensitive'` (ILIKE).
- `create`/`update`: montam `Prisma.clientUncheckedCreateInput`/`UpdateInput` por spread do input já
  parseado — nenhuma lógica extra além das validações de FK.

## Erros

- `400` — body/query inválidos (ex.: `type` fora de `pf`/`pj`, `status` fora do enum, `document`
  ausente no create) → ZodError.
- `403 INSUFFICIENT_SCOPE` — token sem o scope da rota.
- `404 CLIENT_NOT_FOUND` — `getById` / `getByDocument` com id/document inexistente.
- `404 NOT_FOUND` (genérico) — **`update` de id inexistente**: o `update` não checa existência antes,
  então cai no `P2025` do Prisma, que o `error-handler` mapeia para o `NOT_FOUND` genérico — **não**
  `CLIENT_NOT_FOUND` (verificado em 2026-07-30). É o mesmo comportamento de `departments`/
  `positions`/`bands`/`squads`/`bus`, por isso foi mantido; ver Gotchas.
- `404` — `SQUAD_NOT_FOUND` (`squad_id` inexistente, no create/update/`listBySquad`),
  `SPECIALIST_NOT_FOUND` (`specialist_id` inexistente, no create/update/`listBySpecialist`),
  `CREATED_BY_NOT_FOUND` (`created_by` inexistente no create).
- `409 CONFLICT` — `document` duplicado (`P2002`, `details.target` inclui `"document"`).

## Gotchas

- **`document` está armazenado SEM pontuação** — só dígitos (verificado em 2026-07-30: máximo de 14
  chars nos 293 registros = CNPJ cru; `representative_cpf` idem, máx 11 = CPF cru). Como
  `GET /clients/by-document/:document` faz **match exato** (`findUnique`), um front que mande
  `00.000.000/0001-00` recebe **404**, não o cliente — normalize para dígitos antes de chamar. A
  API **não** normaliza hoje (nem no lookup nem no create), então gravar um documento formatado
  criaria uma linha que o lookup dos outros sistemas não acha. Se isso virar problema, a correção é
  normalizar nas duas pontas de uma vez, não só no lookup.
  - Corolário: se algum dia houver documento formatado, o `/` do CNPJ quebra o roteamento em dois
    segmentos — o chamador precisaria de `encodeURIComponent`. Não é o caso com o dado atual.
- `type`/`status` têm CHECK constraint no Postgres, mas isso **não** virou enum no Prisma
  (`schema.prisma` traz um comentário do introspect avisando disso: *"This table contains check
  constraints..."*). A validação de enum no Zod é a única linha de defesa antes do banco — não
  remova sem substituir por outra checagem equivalente.
- `client.id` sai como **`number`**, não string — diferente do padrão BigInt-como-string de
  `access-logs`. Não uniformize os dois sem entender por que são casos diferentes (ver Service acima).
- Não existe rota de hard delete de propósito. Se pedirem para adicionar, pare e confirme antes —
  é uma decisão de negócio (histórico financeiro em outro banco), não um detalhe técnico.
- `status` não é filtrável hoje (nem param, nem rota) — ver seção "Desvio deliberado da convenção
  de filtros" acima antes de adicionar.
- **`update` não checa existência antes** de chamar o Prisma: id inexistente cai no `P2025` → `404`
  **genérico** (`NOT_FOUND`), não `CLIENT_NOT_FOUND`. Idêntico a `departments`/`positions`/`bands` —
  se algum dia for padronizado, padronize nos seis módulos de uma vez, não só aqui.
