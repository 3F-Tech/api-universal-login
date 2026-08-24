# CONTEXT.md — 3F Core API (comece por aqui)

> **Leia este arquivo primeiro.** Ele dá o contexto do que é a 3F Core API e de **como o seu sistema
> deve se integrar a ela**. Depois, use [`API.md`](./API.md) (contratos de cada endpoint) e
> [`DATABASE.md`](./DATABASE.md) (modelo de dados).

---

## 1. O que é a 3F Core API

A **3F Core API** (`api-universal-login`) é a **API de identidade centralizada da 3F Venture**. Ela
é a fonte única de verdade sobre **pessoas (usuários), suas credenciais e suas permissões** nos
vários sistemas da empresa.

Os outros sistemas da 3F **não guardam usuários/senhas próprios**: eles **se conectam a esta API**
para autenticar pessoas e/ou para administrar o cadastro central de identidade.

### Além de pessoas: entidades compartilhadas

A Core também abriga cadastros que **vários sistemas** precisam consumir, para não existirem em
cópias divergentes. Desde 2026-07 isso inclui **clientes** (`/clients`), migrados da plataforma de
contratos. O padrão é sempre o mesmo:

> **A identidade fica na Core; o que é específico de um sistema fica no banco daquele sistema**, numa
> tabela de *overlay* que referencia o id da Core (ex.: `sellers` para usuário, `bu_settings` para BU,
> `client_settings` para cliente).

Na prática, se o seu sistema guarda hoje uma tabela própria de clientes, o caminho é: ler a
identidade da Core via HTTP e manter localmente **só** os campos que só você usa. Ao escrever, **grave
primeiro na Core** e só depois faça o upsert local com o id retornado — as duas operações não são
atômicas (bancos diferentes), e a ordem inversa criaria overlay órfão apontando para id inexistente.

### A BU também é uma entidade jurídica

Desde **2026-08-21** a **BU** (`/bus`) deixou de ser só identidade visual (nome, slug, cores, logo):
ela carrega também **identidade jurídica e endereço** — `legal_name` (razão social), `legal_nature`
(natureza jurídica), `cnpj`, `email`, `phone`, e o endereço completo (`cep`, `street`,
`street_number`, `complement`, `neighborhood`, `city`, `state`, `country`).

O motivo é contratual: nos contratos gerados pelos sistemas da 3F, quem **contrata** é a própria
empresa — a 3F Venture ou uma de suas BUs —, e esses campos formam o preâmbulo da parte
**CONTRATANTE**. Antes cada sistema mantinha a razão social *hardcoded* no próprio código; agora a
fonte da verdade é a Core, como já vale para `users` e `clients`.

Desde **2026-08-24** ela carrega também **`email_domain`** — o domínio corporativo da BU
(`3fventure.com.br` para a 3F, `bommamkt.com.br` para a Bomma, etc.). Serve para **montar** o e-mail
de um colaborador recém-contratado (`nome.sobrenome@<email_domain>`) e para **reconhecer** e-mail
interno, coisas que hoje vivem como lista fixa dentro de cada consumidor.

Pontos práticos para quem consome:

- **Todos os 14 campos são opcionais e podem vir `null`.** Uma BU só tem esses dados se alguém os
  preencheu. Trate `null` como "não cadastrado" — não assuma presença.
- **`email_domain` vem sempre sem `@` e em minúsculas.** A API normaliza na escrita (remove `@`
  inicial, aplica lowercase) e valida o formato, então `usuario + '@' + email_domain` é seguro sem
  tratamento adicional — e não vale a pena normalizar de novo do seu lado.
- **Os nomes de endereço são os mesmos de `user`** (`cep`, `street`, `street_number`, `complement`,
  `neighborhood`, `city`, `state`, `country`). É proposital: há uma convenção só de endereço na API,
  não um dialeto por entidade — o mesmo código de formatação serve para os dois.

### Modelo de integração: backend-to-backend

- A comunicação é **servidor ↔ servidor**. **Nunca** chame esta API direto do navegador/app do
  usuário final, e **nunca** exponha a API Key no front-end.
- Não há sessão, cookie, nem login OAuth de usuário final **nesta API**. Toda chamada é autenticada
  por uma **API Key** enviada no header `X-API-Key`.
- O seu back-end recebe a ação do usuário (ex.: um POST de login vindo do seu front), e **ele**
  chama a 3F Core API usando a API Key do seu sistema.

```
[ Front do seu sistema ] → [ Back-end do seu sistema ] → (X-API-Key) → [ 3F Core API ] → [ PostgreSQL ]
```

### Endereços (Base URL)

| De onde você chama | Base URL |
|---|---|
| Projeto na **mesma VPS** da API | `http://localhost:3010` |
| Projeto **externo** | `https://3f-core.3fventure.tech` |

---

## 2. O ponto central: o tipo da API Key define o que você pode fazer

Cada sistema integrado recebe **uma API Key**. Essa key é de **um tipo**, e o tipo determina
**quais ações o seu sistema pode realizar**. Hoje existem **dois modos de integração**:

### 🔑 Modo LOGIN — key do tipo `login`

Para sistemas que só precisam **autenticar seus usuários** contra a base central.

O que essa key libera:
- **Validar login** de um usuário (e-mail + senha) → `POST /auth/validate`;
- **Leitura** dos dados de perfil para montar a tela pós-login: usuários, BUs, sistemas, cargos,
  departamentos, bands e squads (tudo **somente leitura**), para você resolver IDs em nomes.

O que essa key **NÃO** pode: criar/editar/excluir nada, gerenciar API Keys, ver logs de acesso, etc.

Scopes embutidos: `auth:validate`, `users:read`, `bus:read`, `systems:read`, `positions:read`,
`departments:read`, `bands:read`, `squads:read`.

> **`bus:read` inclui a identidade jurídica da BU.** Como `GET /bus` devolve o registro completo, um
> sistema em modo login também enxerga `legal_name`, `cnpj`, `email`, `phone` e o endereço das BUs.
> São dados institucionais da própria 3F (os mesmos que aparecem impressos num contrato), não dados
> pessoais de terceiros — mas se o seu sistema só precisa de nome/cores para a tela pós-login,
> simplesmente ignore os demais campos.

### 🛡️ Modo ADM — key do tipo `adm`

Para ferramentas internas de **administração** da identidade (painel de RH, backoffice, etc.).

O que essa key libera: **acesso total** à API — CRUD completo de usuários, BUs, squads,
departamentos, cargos, bands, sistemas, vínculos (systems-users / systems-bus), API Keys e leitura
de logs de acesso.  

Scope embutido: `admin:*` (cobre todos os scopes).

> **Resumo prático:** se a sua key é `login`, seu sistema **faz login e lê perfil**. Se a sua key é
> `adm`, seu sistema **administra tudo**. O servidor recusa (com `403 INSUFFICIENT_SCOPE`) qualquer
> ação fora do que o tipo da key permite — então o seu código deve assumir só o que o seu modo cobre.

> **Clientes (`/clients`) exigem key `adm`.** Os scopes `clients:read`/`clients:write` **não** estão no
> tipo `login`, e **não existirá** um tipo intermediário para "só ler clientes" — decisão tomada em
> 2026-07-30. Se o seu sistema precisa consumir dados de cliente, ele recebe uma key `adm`; peça a um
> administrador da Core.

---

## 3. Como integrar — por modo

Em ambos os modos, **toda** requisição leva o header:
```
X-API-Key: <a_api_key_do_seu_sistema>
Content-Type: application/json
```

### 3.1 Integração no modo LOGIN

O fluxo típico de uma tela de login do seu sistema:

1. O usuário digita e-mail + senha no **seu** front; seu front manda pro **seu** back-end.
2. Seu back-end chama:
   ```
   POST {BASE_URL}/auth/validate
   X-API-Key: <sua_key_login>
   { "email": "fulano@empresa.com", "password": "senha-digitada" }
   ```
3. Interprete a resposta:
   - **`200`** → credenciais válidas **e** o usuário tem acesso ao seu sistema. O corpo traz o
     usuário (sem senha) + as BUs dele (`bus`). Crie a sessão **no seu sistema** a partir daí.
   - **`401 INVALID_CREDENTIALS`** → e-mail ou senha errados.
   - **`403 NO_SYSTEM_ACCESS`** → o usuário existe, mas **não está liberado** para o seu sistema
     (não há vínculo `systems_users`). Mostre "sem acesso a este sistema".
   - **`403 ACCOUNT_INACTIVE`** → conta desativada.
4. Para exibir nomes em vez de IDs (cargo, departamento, band, squad, BU), use os endpoints de
   leitura (`GET /positions`, `GET /departments`, `GET /bands`, `GET /squads`, `GET /bus`, etc.).

> **Importante:** o vínculo usuário↔sistema (quem pode logar no quê) é gerenciado pelo **modo ADM**,
> não pelo modo login. Se um usuário recebe `NO_SYSTEM_ACCESS`, um administrador precisa vinculá-lo
> ao sistema (ver `PUT /users/:userId/systems` no `API.md`).

### 3.2 Integração no modo ADM

Seu sistema administra o cadastro central. Padrões:
- **CRUD** dos recursos: `GET/POST/PATCH/DELETE` em `/users`, `/bus`, `/squads`, `/departments`,
  `/positions`, `/bands`, `/systems` (ver contratos no `API.md`).
- **Liberar um usuário a acessar um sistema** (o que destrava o login dele lá): vincule via
  `POST /systems/:systemId/users` ou `PUT /users/:userId/systems`.
- **Resetar a senha de um usuário** para a senha padrão da 3F: `POST /users/:id/reset-password`
  (exige key `adm` / `admin:*`).
- **Preencher a identidade jurídica de uma BU** (razão social, CNPJ, natureza jurídica, endereço,
  para uso em contratos): `PATCH /bus/:id`. Enviar um campo como **`null` limpa** o valor;
  **omitir** o campo não mexe nele.
- **Gerenciar API Keys** de outros sistemas: `POST /api-keys` (escolhendo `type: "adm" | "login"`).
  A key crua só aparece **uma vez** na criação — capture e entregue com segurança.
- **Auditar acessos**: `GET /systems/:systemId/access-logs` e `GET /users/:userId/access-logs`.

---

## 4. Regras que todo integrador precisa saber

- **Segredos nunca trafegam:** a API nunca retorna `password` (do usuário) nem `key_hash` (da key).
- **A API Key é secreta:** trate-a como senha. Só no back-end, só em variável de ambiente, nunca no
  repositório nem no front. Se vazar, peça revogação (um ADM faz `PATCH /api-keys/:id { is_active:false }`).
- **`DELETE` é exclusão real** (hard delete). Para apenas desabilitar, use `PATCH { "is_active": false }`.
- **Envelopes padrão:** sucesso vem em `{ "data": ... }` (listas têm `{ "data": [...], "meta": {...} }`);
  erro vem em `{ "error": { "code", "message", "details?" } }`. Programe contra o **`code`**, não
  contra a mensagem.
- **Hidrate em lote, nunca item por item.** Para resolver muitos ids de uma vez existem rotas de
  batch: `POST /clients/batch` (`{ ids: [...] }`, máx. 200) e `GET /users/photos?ids=...` (máx. 50).
  Numa listagem, colete os ids distintos da página, faça **uma** chamada e monte um `Map` em memória.
  Chamada dentro de loop estoura o rate limit e é sempre um bug.
- **Campos grandes não vêm em listagem.** `user.profile_picture`, `user.contract_base64` e
  `client.logo_picture` só aparecem no detalhe (`GET /<recurso>/:id`) ou na rota de fotos em lote —
  são campos grandes (base64 inline) e ficariam proibitivos em respostas de múltiplos registros.
- **`GET /bus` é exceção: devolve o registro completo**, identidade jurídica e endereço inclusos.
  Não há projeção reduzida ali, então dá para montar um catálogo de BUs numa **única** chamada, sem
  precisar de um `GET /bus/:id` por BU. Não generalize o comportamento de `clients` para `bus`.
- **Rate limit por key:** ~100 req/min por padrão. Ao estourar: `429 RATE_LIMITED`. Implemente
  retry com backoff.
- **Datas em UTC / ISO 8601.**

---

## 5. Onboarding de um novo sistema (resumo)

1. Um administrador cadastra o seu sistema na 3F Core API (`POST /systems`).
2. Gera uma API Key para ele, escolhendo o tipo conforme o caso de uso:
   - precisa só autenticar usuários → **`login`**;
   - é uma ferramenta de administração → **`adm`**.
3. Entrega a key crua (mostrada uma única vez) para o time do sistema guardar como segredo.
4. (Modo login) Os usuários que poderão logar no novo sistema são vinculados a ele
   (`systems_users`) por um administrador.
5. O seu sistema passa a chamar a API com `X-API-Key`, seguindo o modo correspondente.

---

## 6. Para onde ir agora

- **[`API.md`](./API.md)** — referência completa: autenticação, formato de resposta, erros e
  **todos os endpoints** (método, scope, params, query, body, resposta).
- **[`DATABASE.md`](./DATABASE.md)** — modelo de dados: tabelas, colunas, tipos, relações e
  restrições por trás dos endpoints.
