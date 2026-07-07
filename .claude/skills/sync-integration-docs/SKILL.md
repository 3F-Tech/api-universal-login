---
name: sync-integration-docs
description: Audits and updates documentation/API.md, documentation/CONTEXT.md, and documentation/DATABASE.md — the three integration reference docs (in the documentation/ folder) that brief external front-end/AI agents on how to consume the 3F Core API — so they match the current state of the codebase. Use when the user asks to sync/update/refresh/atualizar the API docs, says these docs are outdated/desatualizados, or after a batch of endpoint/schema/scope/database changes that should be reflected in the public-facing reference.
---

# Sync Integration Docs

`documentation/API.md`, `documentation/CONTEXT.md`, `documentation/DATABASE.md` são a referência que
uma IA/dev de **outro** time lê para integrar um front-end a esta API — eles nunca veem o
código-fonte. **A pasta `documentation/` é a fonte oficial** (versionada); não existe mais cópia na
raiz do repo. Precisão aqui é maior prioridade que economia de tokens: um endpoint, scope ou coluna
documentado errado gera integração quebrada em outro repositório.

Esta skill não assume que o código mudou pouco — trate os três arquivos como **possivelmente
obsoletos em qualquer seção** e reconstrua cada parte a partir da verdade no código, não a partir
de um diff mental do que "provavelmente" mudou.

## Fontes de verdade (nessa ordem, por assunto)

| Assunto | Fonte de verdade | Não confie em |
|---|---|---|
| Endpoints, métodos, scopes por rota | `src/modules/<nome>/routes.ts` (todos os módulos) | `rule.md` (pode estar desatualizado também) |
| Body/query/params, validações, tipos | `src/modules/<nome>/schema.ts` | descrições soltas no `rule.md` |
| Regras de negócio, side-effects, cascades, erros de negócio | `src/modules/<nome>/service.ts` + `rule.md` do módulo | suposição/genéricos |
| Catálogo de scopes e o que cada `type` de key libera | `src/config/scopes.ts` | `documentation/API.md`/`CONTEXT.md` atuais |
| Tabelas, colunas, tipos, nullable, FK, unique, cascade | `prisma/schema.prisma` (introspectado — é a verdade do banco) | `documentation/DATABASE.md` atual |
| Envelope de resposta, paginação, formato de erro, rate limit | `src/utils/http.ts`, `src/utils/pagination.ts`, `src/middlewares/error-handler.ts` (ou onde estiverem) — grep se não souber o caminho exato | descrições antigas |
| Convenções globais (CRUD, hard delete, `is_active`, nullable→null) | `CLAUDE.md` da raiz | — |

`rule.md` de cada módulo (`src/modules/<nome>/rule.md`) é um bom **atalho** para entender regras de
negócio rapidamente, mas **verifique contra o código** antes de documentar algo — a política do
projeto pede que `rule.md` seja atualizado a cada mudança, mas isso nem sempre acontece na prática.

## Processo

1. **Leia os três docs atuais** (`documentation/API.md`, `documentation/CONTEXT.md`,
   `documentation/DATABASE.md`) inteiros — é a base sobre a qual você vai editar, não algo pra
   reescrever do zero.
2. **Levante a verdade atual em paralelo** (uma leitura por módulo compensa — são ~13 módulos):
   - Todos os `src/modules/*/routes.ts` + `schema.ts` → lista completa de endpoints, métodos,
     scopes, params/query/body.
   - `src/config/scopes.ts` → catálogo de scopes e o que cada `type` de API key (`adm`/`login`)
     libera.
   - `prisma/schema.prisma` → toda tabela, coluna, tipo Postgres, nullable, default, FK, unique,
     cascade, PK composta/BigInt.
   - Para cada módulo cuja rota mudou desde a última leitura do `rule.md`, confira `service.ts` para
     regras de negócio, erros específicos e efeitos colaterais (cascade, side-effects).
   - Se a tarefa foi disparada depois de uma mudança específica que o usuário mencionou, comece por
     ali — mas ainda confira o restante, porque "desatualizado" pode ser mais amplo do que a mudança
     citada.
3. **Compare cada seção dos três docs contra essa verdade.** Para cada divergência, classifique:
   - **Faltando** — endpoint/campo/tabela/coluna existe no código mas não no doc.
   - **Errado** — doc descreve algo que já não é assim (tipo, obrigatoriedade, scope, nome).
   - **Órfão** — doc descreve endpoint/campo/tabela que não existe mais no código → **remova**, não
     deixe como está. Docs de integração com lixo órfão são piores que docs incompletos, porque quem
     integra tenta usar o que não existe.
4. **Edite os três arquivos com `Edit`**, preservando estrutura, tom (pt-BR) e formatação existente
   — são referências já bem organizadas, o objetivo é corrigir conteúdo, não redesenhar a
   apresentação. Mantenha:
   - `API.md`: a tabela-resumo da seção 7 tem que ficar espelhando exatamente as seções 6.x — se
     adicionar/remover endpoint em uma, replique na outra.
   - `CONTEXT.md`: é o "onboarding" de alto nível (modos LOGIN/ADM, o que cada tipo de key libera) —
     não descreve endpoint por endpoint; se um scope mudou o que cada modo libera, atualize a seção 2
     e a lista de scopes embutidos.
   - `DATABASE.md`: uma tabela por tabela do banco, com o índice e o "mapa de relacionamentos" no
     topo — se uma tabela/coluna/FK mudou, atualize a tabela **e** o mapa ASCII se a relação mudou.
5. **Não documente nada que você não confirmou no código.** Se uma seção parecer certa mas você não
   verificou a fonte correspondente nesta rodada, verifique antes de deixar como está — "parece
   certo" não é o mesmo que "confirmado nesta rodada".
6. **Ao final, resuma pro usuário** o que mudou em cada arquivo (adicionado / corrigido / removido),
   em bullets curtos — não repita o conteúdo inteiro do doc, só o diff conceitual. Se algo ficou
   ambíguo (ex.: uma regra de negócio que o código não deixa claro), pergunte em vez de inventar.

## Fora de escopo

- Não toque em `README.md`, `planning.md`, `CLAUDE.md` ou `rule.md` dos módulos — são documentos
  internos com público e regras de atualização próprias (`rule.md` já tem sua própria política no
  `CLAUDE.md`).
- Não rode `prisma db pull` — `prisma/schema.prisma` já é a introspecção mais recente commitada; se
  ela mesma parecer desatualizada em relação ao banco real, avise o usuário em vez de tentar
  reconectar (exige túnel/Docker, ver memória do projeto).
- Não invente exemplos de payload que não correspondam exatamente aos tipos do Zod schema.
