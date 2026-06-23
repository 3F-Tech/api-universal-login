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

### 🛡️ Modo ADM — key do tipo `adm`

Para ferramentas internas de **administração** da identidade (painel de RH, backoffice, etc.).

O que essa key libera: **acesso total** à API — CRUD completo de usuários, BUs, squads,
departamentos, cargos, bands, sistemas, vínculos (systems-users / systems-bus), API Keys e leitura
de logs de acesso.  

Scope embutido: `admin:*` (cobre todos os scopes).

> **Resumo prático:** se a sua key é `login`, seu sistema **faz login e lê perfil**. Se a sua key é
> `adm`, seu sistema **administra tudo**. O servidor recusa (com `403 INSUFFICIENT_SCOPE`) qualquer
> ação fora do que o tipo da key permite — então o seu código deve assumir só o que o seu modo cobre.

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
