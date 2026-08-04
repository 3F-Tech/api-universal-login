# Carteira do Especialista na 3F Core — Contexto & Pedido de Integração

> **Para quem lê no projeto `api-universal-login` (3F Core).** Este documento leva TODO o contexto
> necessário para hospedar a **carteira do especialista** na Core: o que ela é, onde vive hoje, o que
> a Core **já tem pronto**, o que **falta construir**, e como fazer o **backfill** dos dados. Escrito
> a partir do código real do Sistema de Gestão (plataforma de contratos) em 2026-08.

---

## 0. TL;DR (resumo executivo)

- **"Carteira do especialista"** = o vínculo **cliente → especialista de atendimento** (quem cuida da
  retenção daquele cliente). Hoje esse vínculo é a coluna `client_settings.specialist_id` no banco do
  **Sistema de Gestão**, não na Core.
- **A Core JÁ modelou esse campo** na migração de clientes (07/2026): `client.specialist_id`
  (FK → `user`) e `client.squad_id` (FK → `squad`). Mas nasceram **100% NULL** e o Sistema de Gestão
  **nunca passou a usá-los** — continuou lendo/gravando a carteira no overlay local. Então o campo
  existe, só está ocioso.
- **Objetivo:** tornar a **Core a fonte da verdade** da carteira (para que outros sistemas também
  enxerguem "de quem é" cada cliente), fazer o **backfill** dos valores locais para a Core e desligar
  a cópia local.
- **O que falta na Core (o pedido concreto):** basicamente **2 endpoints** — (1) **atribuição em
  lote** de especialista (a gestão reatribui N clientes de uma vez; hoje só existe `PATCH` 1-a-1, que
  estoura o rate limit); (2) **agregado de contagem por especialista** (para o badge "N clientes").
  Detalhes na §7.
- **O que NÃO move:** toda a maquinaria de retenção (sorteio de handoff, eventos de renovação/churn,
  metas, capacidade, comissão, ciclos de conta) e o `contact_id` (aponta para o CRM local). Isso é
  **operacional do Sistema de Gestão**, não identidade compartilhada — fica local. Ver §5.

---

## 1. O que é a "carteira do especialista" (negócio)

A 3F tem um time de **especialistas de atendimento / CS** responsáveis pela **retenção** dos clientes
depois da venda. Cada cliente ativo "pertence" a um especialista — essa é a **carteira**.

- Um cliente ganha especialista de duas formas:
  1. **Handoff D0 (automático):** quando um contrato é 100% assinado, o Sistema de Gestão roda um
     **sorteio ponderado** (por taxa de retenção do especialista, em camadas por valor do cliente) e
     atribui o vencedor. Toda a lógica do sorteio é do Sistema de Gestão (§5).
  2. **Atribuição manual (gestor):** admin/head/coord vincula ou reatribui especialista a **um ou
     vários** clientes de uma vez, numa tela de gestão de carteira.
- A carteira alimenta: a tela **"Minha Carteira"** (o especialista vê só os próprios clientes), a aba
  **"Por Especialista"** (gestor vê a distribuição + badge de contagem), os **dashboards de
  retenção** (NMRR/cohort/taxa), o **cálculo de comissão** e os **eventos de renovação/expansão/churn**.

O ponto de mover para a Core: a carteira é um **fato compartilhado** (como a BU ou o squad de uma
pessoa). Outros sistemas da 3F podem querer saber de quem é um cliente sem falar com o Sistema de
Gestão. Por isso ela pertence ao cadastro central, no mesmo espírito da migração de clientes.

---

## 2. Estado atual — onde a carteira vive hoje

O Sistema de Gestão segue o padrão **identidade-na-Core + overlay-local** (o mesmo de `user`↔`sellers`
e `bu`↔`bu_settings`). Para cliente:

- **Identidade** (nome, documento, contato, endereço, representante, `status`, logo) → **3F Core**
  (`/clients`), consumida por HTTP via a fachada `services/clientIdentity.ts`.
- **Overlay local** → tabela `client_settings` no banco do Sistema de Gestão:

```
model client_settings {          // banco do SISTEMA DE GESTÃO (não a Core)
  client_id       BigInt  @id    // = client.id da Core (mesmo id, sem FK real — bancos diferentes)
  specialist_id   BigInt?        // ← A CARTEIRA. = user.id da Core (especialista)
  squad_id        Int?           // squad do cliente (derivado; trava no squad do especialista)
  squad_id_manual Boolean        // flag: squad foi travado manualmente (via especialista) vs. auto
  is_delinquent   Boolean        // inadimplência (flag operacional da gestão)
  contact_id      BigInt?        // → contacts (CRM/GHL) LOCAL — não existe na Core
  created_at / updated_at
}
```

**A carteira, hoje, é `client_settings.specialist_id`.** Quando a tela do cliente é montada, o Sistema
de Gestão lê a identidade da Core e faz *merge* com esse overlay — o front recebe um objeto único com
`specialist_id`, `squad_id`, etc., mas esses três **nunca** vêm da Core: vêm do overlay local.

> Observação importante: a fachada local (`clientIdentity.ts`) hoje **ignora** `specialist_id`/
> `squad_id` que a Core devolve em `GET /clients` — ela só lê identidade. É essa cópia que queremos
> eliminar.

---

## 3. Descoberta-chave: a Core JÁ tem `specialist_id` e `squad_id`

Na migração de clientes (`sistema_gestao.clients` → `core.client`, 07/2026), a tabela `client` da Core
nasceu **já com as colunas da carteira**, prontas mas ociosas (fonte: `DATABASE.md` da Core):

| Coluna Core | Tipo | FK | Estado hoje |
|---|---|---|---|
| `client.specialist_id` | `int4` | → `user.id` (**NO ACTION**) | **100% NULL** |
| `client.squad_id` | `int4` | → `squad.id` (**NO ACTION**) | preenchido em **15** de 293 |

E a API já expõe leitura/escrita desses campos:

- `GET /clients` e `GET /clients/:id` **retornam** `specialist_id` e `squad_id`.
- `POST /clients` e `PATCH /clients/:id` **aceitam** `specialist_id` e `squad_id` (ambos aceitam `null`
  para limpar; validados quando enviados: 404 `SPECIALIST_NOT_FOUND` / `SQUAD_NOT_FOUND`).
- `GET /users/:userId/clients` → clientes de um especialista (via `client.specialist_id`).
- `GET /squads/:squadId/clients` → clientes de um squad (via `client.squad_id`).

**A própria DATABASE.md da Core deixou o recado** (seção da tabela `client`):

> *"`specialist_id` nasceu NULL de propósito. Na origem havia só dois valores, ambos apontando para
> devs, não para especialistas reais — foram descartados para a FK nova nascer limpa. Quando a
> atribuição passar a valer, grave o `user.id` da Core (não o `sellers.id` local)."*

Ou seja: **o design já previu isso**. O trabalho não é modelar do zero — é **ativar** o que já existe,
migrar os dados e preencher duas lacunas de API.

> ⚠️ **Confirmar antes do backfill:** os `specialist_id` que estão HOJE em `client_settings` foram
> atribuídos **depois** da migração (por handoff/manual), então já devem ser `user.id` de especialistas
> reais — diferente dos "dois devs" que a Core descartou na carga inicial. Validar isso na §8.

---

## 4. O que "mover a carteira para a Core" significa, na prática

Três frentes, nesta ordem:

1. **Backfill** — copiar `client_settings.specialist_id` (e, se decidido, `squad_id`) do Sistema de
   Gestão para `client.specialist_id`/`client.squad_id` na Core. (§8)
2. **Cutover de leitura** — o Sistema de Gestão passa a **ler** a carteira do campo da Core
   (que agora vem hidratado), e para de ler do overlay local para esse fim.
3. **Cutover de escrita** — toda atribuição/reatribuição (manual e via handoff) passa a **gravar na
   Core**. Para isso a Core precisa de **atribuição em lote** (§7), senão o rate limit inviabiliza.

Frentes 2 e 3 são trabalho no **Sistema de Gestão**; este documento existe para viabilizar a frente 1
e as lacunas de API da frente 3, que são trabalho na **Core**.

---

## 5. Mapa de dados: o que move e o que fica

### ✅ MOVE para a Core (vira fonte da verdade)

| Campo local | Vira na Core | Observação |
|---|---|---|
| `client_settings.specialist_id` | `client.specialist_id` | **O núcleo da carteira.** BigInt local = `user.id` Core (mesmo espaço). |
| `client_settings.squad_id` *(decisão)* | `client.squad_id` | Já existe na Core. Fortemente acoplado ao especialista (trava no squad dele). Ver decisão na §10. |

### ⛔ FICA no Sistema de Gestão (operacional, não é identidade compartilhada)

Tudo abaixo referencia `client_id` e/ou `specialist_id`, mas é **lógica/histórico interno da gestão** —
não faz sentido na Core e depende de tabelas que só existem localmente:

| Tabela local | Papel | Por que fica |
|---|---|---|
| `client_settings.contact_id` | Link p/ o contato do CRM (GHL) | Aponta para `contacts` **local**; a Core não tem CRM. |
| `client_settings.is_delinquent` | Flag de inadimplência | Operacional; a Core nem modela. (Decisão §10 se quiser subir.) |
| `client_settings.squad_id_manual` | Estado da derivação de squad | Detalhe de *como* a gestão calcula squad; não é identidade. |
| `specialist_lottery_runs` | Auditoria do sorteio de handoff | Lógica de negócio da gestão. |
| `specialist_renewal_events` | Eventos renovação/expansão/redução/churn (base da taxa de retenção) | Operacional/financeiro da gestão. |
| `specialist_goals` | Metas de retenção por especialista/BU | Idem. |
| `specialist_capacity_tags` / `_overrides` | Capacidade de atendimento por especialista | Idem. |
| `handoff_lottery_settings` | Tuning do sorteio (cortes de tier) | Idem. |
| `retention_commission_policy` | Faixas de comissão de retenção | Idem. |
| `account_cycles` / `account_cycle_pir_versions` | Ciclos de 90 dias (Hub da Conta, SPICED, PIR) | Idem. |
| `contract_churns` | Histórico de churn/cancelamento | Idem. |

**Resumo:** só o **vínculo** (client → especialista) sobe. A **maquinaria** que consome esse vínculo
continua no Sistema de Gestão, lendo `client.specialist_id` da Core em vez do overlay.

---

## 6. Operações que a gestão faz hoje na carteira (requisitos funcionais)

Para a Core cobrir a carteira, precisa suportar estas operações (✅ = já suportado; ⚠️ = lacuna):

| # | Operação (hoje, no overlay local) | Suporte na Core hoje |
|---|---|---|
| 1 | Ler o especialista de **um** cliente | ✅ `GET /clients/:id` (`specialist_id`) |
| 2 | Ler o especialista de **todos** (catálogo p/ enriquecer a lista) | ✅ `GET /clients` (já traz `specialist_id`) |
| 3 | Listar clientes de **um** especialista ("Minha Carteira") | ✅ `GET /users/:userId/clients` |
| 4 | Vincular/reatribuir especialista a **um** cliente (create/update manual, handoff) | ✅ `PATCH /clients/:id { specialist_id }` |
| 5 | **Atribuir/desatribuir especialista a VÁRIOS clientes de uma vez** (tela de carteira) | ⚠️ **LACUNA** — só existe `PATCH` 1-a-1; N chamadas estouram o rate limit (~100/min) |
| 6 | **Contagem de clientes por especialista** (badge "N", aba "Por Especialista") | ⚠️ **LACUNA** — não há agregado; hoje contamos localmente |
| 7 | Listar clientes **sem** especialista (`unassigned`) p/ a fila de atribuição | ⚠️ Parcial — não há filtro "sem especialista"; hoje filtramos em memória |

Os itens 5 e 6 (e talvez 7) são o **pedido concreto** para a Core — §7.

---

## 7. O pedido: o que precisa ser construído na Core

### 7.1 🔴 Atribuição de especialista **em lote** (bloqueador)

**Problema:** a tela de carteira reatribui um especialista (ou desvincula) a **um conjunto** de
clientes numa ação só. Com `PATCH /clients/:id` seria **uma chamada HTTP por cliente** → estoura o
rate limit da Core (~100 req/min) e vira operação lenta/frágil. É exatamente por isso que o Sistema de
Gestão hoje grava esse lote **localmente** numa transação. Para mover a carteira, a Core **precisa** de
escrita em lote.

**Sugestão de contrato** (nome/rota a critério da Core; alinhar com a convenção "filtro é rota"):

```
POST /clients/assign-specialist        (scope: clients:write)
{
  "specialist_id": 42,        // user.id da Core; null/omitido = DESVINCULAR
  "client_ids": [12, 40, 291] // 1..N ids (sugerir teto, ex. 200, como o /clients/batch de leitura)
}
→ 200 { "data": { "specialist_id": 42, "updated": [12,40,291], "count": 3 } }
```

Requisitos:
- `specialist_id = null` **desvincula** todos os `client_ids` (volta a carteira a "sem especialista").
- Validar o `specialist_id` **uma vez** (404 `SPECIALIST_NOT_FOUND`), não por cliente.
- Ids inexistentes: seguir a semântica do `/clients/batch` de leitura (omitir sem erro) **ou**
  validar tudo-ou-nada (como `POST /systems/:id/users/batch`) — **decisão da Core**; a gestão se
  adapta. Preferência leve por "omitir sem derrubar o lote".
- Idempotente (reatribuir para o mesmo especialista não é erro).

> Alternativa aceitável: um `PATCH /clients/batch { ids, patch: { specialist_id } }` genérico. A
> rota dedicada é mais legível e casa com a convenção da Core ("filtro/ação explícita vira rota").

### 7.2 🟡 Agregado de **contagem por especialista**

**Problema:** a aba "Por Especialista" mostra um badge "N clientes" para cada especialista. Hoje o
Sistema de Gestão calcula isso varrendo o overlay local. Se a carteira mora na Core, ou a Core entrega
o agregado, ou a gestão passa a contar sobre o catálogo cacheado da Core.

**Sugestão** (barata de fazer com um `GROUP BY`):

```
GET /clients/by-specialist        (scope: clients:read)
→ 200 { "data": [ { "specialist_id": 42, "count": 17 }, { "specialist_id": 51, "count": 9 } ] }
```

- Contar só `is_active = true` (registro não excluído). Ignorar `specialist_id IS NULL`.

> **Se a Core preferir não construir isto**, a gestão consegue derivar a contagem do catálogo
> (`GET /clients` paginado, já cacheado 60s) agora que `specialist_id` virá hidratado. É a decisão
> de menor esforço para a Core — sinalize a preferência. (Ver §10.)

### 7.3 🟡 Filtro "sem especialista" (`unassigned`)

**Problema:** a fila de atribuição precisa listar clientes **sem** especialista. A Core tem
`GET /users/:userId/clients` (com especialista) mas não o complemento (sem nenhum).

**Sugestão:** aceitar `GET /clients?unassigned=true` (só `specialist_id IS NULL`), ou uma rota
dedicada. **Baixa prioridade** — a gestão pode filtrar em memória sobre o catálogo. Incluído por
completude.

### 7.4 ⚠️ Consistência referencial ao mexer em especialista

Com a carteira preenchida na Core, as FKs `NO ACTION` de `client` passam a **morder** (já documentado
na DATABASE.md/API.md da Core):

- **`DELETE /users/:id`** de um usuário que é `specialist_id` de algum cliente → **`409 FK_CONSTRAINT`**
  (hoje não ocorre porque a coluna está NULL; **passará a ocorrer**).
- Idem `DELETE /squads/:id` se o squad tiver clientes (já ocorre com os 15 atuais).

**Decisão da Core (§10):** manter `NO ACTION` (o consumidor desvincula antes de excluir) ou trocar as
FKs de `client` para `SET NULL` (alinhar com o resto da Core). Se mantiver `NO ACTION`, **documentar**
para a gestão tratar (desvincular a carteira antes de desativar um especialista).

---

## 8. Plano de backfill / migração de dados

**Fonte:** `sistema_gestao.client_settings` (banco do Sistema de Gestão).
**Destino:** `core.client.specialist_id` (e `squad_id`, se no escopo).

Passos sugeridos:

1. **Extrair** do Sistema de Gestão os pares a migrar:
   `SELECT client_id, specialist_id, squad_id FROM client_settings WHERE specialist_id IS NOT NULL;`
   (São poucos — a base é ~293 clientes; só um subconjunto tem especialista.)
2. **Validar identidades** contra a Core **antes** de gravar:
   - cada `specialist_id` existe como `user` (e idealmente `is_active`) → senão o `PATCH` dá
     `SPECIALIST_NOT_FOUND`;
   - cada `client_id` existe na Core (os ids foram preservados na migração, então devem existir);
   - se migrar `squad_id`: cada `squad_id` existe como `squad`.
3. **Confirmar** que os `specialist_id` atuais são especialistas reais (não os "dois devs" que a Core
   descartou na carga inicial) — cruzar com o cargo "Especialista" na Core (mesmo critério que o
   sorteio de handoff usa: `position_id` do cargo Especialista). Descartar/lista de exceções o que não
   casar, para revisão manual.
4. **Gravar na Core** via o **endpoint de lote da §7.1** (idealmente), agrupando por `specialist_id`
   (um POST por especialista com todos os `client_ids` dele). Sem o endpoint de lote, seria `PATCH`
   1-a-1 com backoff no 429 — evitável se o lote existir antes do backfill.
5. **Reconciliar** (lição registrada na própria DATABASE.md da Core): comparar por **`COUNT(*)` e por
   valor** (não por `updated_at` — a tabela `client` teve o trigger de `updated_at` quebrado na
   migração anterior e o filtro por data deu **falso-negativo**). Conferir que
   `count(client.specialist_id NOT NULL)` na Core == `count(client_settings.specialist_id NOT NULL)`
   na gestão, e um checksum dos pares `(client_id, specialist_id)`.
6. **Só então** desligar a leitura/escrita local da carteira no Sistema de Gestão (cutover), mantendo
   o overlay local só para o que continua local (`contact_id`, `is_delinquent`, `squad_id_manual`).

> **Janela de escrita dupla:** enquanto o cutover não fecha, atribuições novas (handoff/manual)
> continuam caindo no overlay local. Ou congela a atribuição durante o backfill, ou faz o Sistema de
> Gestão escrever **nos dois** por um curto período. Alinhar no cronograma.

---

## 9. Regras e gotchas da Core que impactam este trabalho

(Extraídos de `CONTEXT.md`/`API.md`/`DATABASE.md` da Core — repetidos aqui para não precisar pular.)

- **`/clients/*` exige key `adm` (`admin:*`).** Os scopes `clients:read`/`clients:write` **não** estão
  no tipo `login` e não haverá tipo intermediário (decisão 2026-07-30). Qualquer novo endpoint de
  carteira herda isso.
- **`specialist_id` grava `user.id` da Core** — nunca o `sellers.id`/id local. São espaços de ID
  independentes. (No overlay local o valor **já é** o `user.id` da Core, então o backfill é 1:1.)
- **`client.id` é BigInt no banco, exposto como `number` pela API.** Valores atuais (~300) estão longe
  do limite do JS. (Já é o id que a gestão usa como `client_settings.client_id`.)
- **`status` ≠ `is_active`.** `status` é ciclo comercial (5 valores); `is_active` é soft-delete. A
  contagem/lista da carteira deve considerar `is_active = true` (registro não excluído) — um cliente em
  churn segue `is_active = true` e ainda tem especialista.
- **Sem `DELETE /clients/:id`** — desativar é `PATCH { is_active: false }`.
- **Rate limit ~100 req/min por key**, envelope de erro `{ error: { code, message, details } }`
  (programar contra `code`), paginação `perPage` máx **100**, batch de leitura (`/clients/batch`) máx
  **200 ids**. O endpoint de lote da §7.1 deve respeitar esse teto por chamada.
- **FKs de `client` são `NO ACTION`** (assimetria com o resto da Core) — ver §7.4.
- **`type` do cliente é minúsculo (`'pf'`/`'pj'`)** na Core — irrelevante p/ a carteira, mas é uma
  pegadinha conhecida (a gestão usa `'PJ'` maiúsculo em `contracts_templates.person_type`).

---

## 10. Decisões pendentes (levar ao dono do produto / time da Core)

1. **Escopo do que sobe:** só `specialist_id`, ou também `squad_id`?
   - *A favor de subir `squad_id`:* já existe na Core; hoje trava no squad do especialista (acoplado);
     habilita `GET /squads/:squadId/clients` e dashboards de squad multi-sistema.
   - *Contra:* o `squad_id` da gestão é **derivado** (do especialista ou do vendedor do contrato) e
     carrega o flag `squad_id_manual`, que **não existe na Core**. Se subir `squad_id` sem o flag, o
     overlay local ainda guarda `squad_id_manual` — aceitável (overlay mínimo permanece). **Recomendação:
     subir `specialist_id` primeiro; tratar `squad_id` como fase 2.**
2. **Contagem por especialista (§7.2):** a Core entrega o agregado `GET /clients/by-specialist`, ou a
   gestão conta sobre o catálogo? (Menor esforço para a Core = gestão conta.)
3. **Semântica de ids inexistentes no lote (§7.1):** omitir sem erro (estilo `/clients/batch`) ou
   tudo-ou-nada com `details.missing` (estilo `/systems/:id/users/batch`)?
4. **FKs `NO ACTION` vs `SET NULL` (§7.4):** manter (consumidor desvincula antes de excluir) ou alinhar
   com o resto da Core?
5. **`is_delinquent`:** fica no overlay local (recomendado) ou vira campo da Core também? (Hoje a Core
   não modela; sem demanda de outros sistemas, manter local.)

---

## 11. Apêndice — shapes atuais (referência)

**Overlay local que o Sistema de Gestão mantém hoje** (o que se quer esvaziar da parte de carteira):

```
client_settings(client_id PK, specialist_id, squad_id, squad_id_manual, is_delinquent, contact_id)
```

**Item de `GET /clients` da Core hoje** (já traz os campos da carteira, hoje NULL):

```json
{
  "id": 12, "type": "pj", "name": "Acme LTDA", "document": "12345678000190",
  "status": "active", "is_active": true,
  "squad_id": 3, "specialist_id": null,          // ← a carteira, ociosa hoje
  "created_at": "…", "updated_at": "…"
}
```

**Como a gestão atribui em lote hoje (localmente)** — a operação que precisa virar chamada à Core:

```
POST /clients/assign-specialist   (Sistema de Gestão)
{ "specialist_id": "42" | null, "client_ids": ["12","40","291"] }
// null desvincula; ao vincular, o squad_id trava no squad do especialista (squad_id_manual=true)
```

---

### Contato / origem
Documento gerado a partir do código do Sistema de Gestão (`apps/api/src/services/clientIdentity.ts`,
`services/clientService.ts`, `controllers/clientController.ts`, `services/specialistLotteryService.ts`,
`prisma/schema.prisma`) e dos docs da Core em `3f-core-context/{CONTEXT,API,DATABASE}.md`.
