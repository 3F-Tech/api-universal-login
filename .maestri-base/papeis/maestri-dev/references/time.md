# Mapa do time

Mapa dos papéis da base, dos arquivos que eles dividem e dos acoplamentos entre eles. No projeto, esta
cópia é o **mapa do time deste projeto**: você a mantém (checklist, item 8), acrescentando os agentes do
dev e o que mudar. Caminhos relativos à raiz. O arquivo e a responsabilidade reais de cada papel estão
no `.maestri-base/projeto.json`; a pasta padrão de instalação é `.maestri-base/papeis/<pasta>/`.

## Papéis da base (17)

| Camada | Papel (`papel` no JSON) | Pasta | O que faz | Scripts e config |
|---|---|---|---|---|
| núcleo | `orquestrador` | `orquestrador/` | Leva uma frente (plano aprovado ou pedido) até a aprovação do dev e o commit; recruta e delega, confere o diff; não coda | modelos do registro e do progresso em `references/` |
| núcleo | `back` (builder, com `camada`) | `back/` | Código da camada de servidor, uma tarefa por vez; define o contrato; não commita | — |
| núcleo | `front` (builder, com `camada`) | `front/` | Código da camada de interface; consome o contrato; não commita | — |
| núcleo | `planner` | `planner/` | Entrevista o dev e grava o plano (`plan.md` de 9 seções + `grill.md`); para depois do "aprovado" | modelos em `references/` |
| núcleo | `revisor` | `revisor/` | Segunda leitura independente do diff; só aponta (P0–P3, até 3 rodadas) | `scripts/revisao.cjs` (`captura`, `linha`) + teste |
| núcleo | `joker` | `joker/` | Coringa do dev: investiga e coda direto; delega quando o dev quer; acionado pelo Orquestrador, não commita | — |
| núcleo | `maestri-dev` | `maestri-dev/` | Mantém o time; ligado no último passo da adaptação; não coda o sistema | — |
| operação | `watchdog` | `watchdog/` | Mantém os servidores de dev no ar por script; pedidos e incidentes. Só Windows e Claude Code | `scripts/watchdog.cjs`, `processos.cjs` + teste; `.maestri-base/watchdog.json` |
| operação | `deploy` | `deploy/` | Publica com ordem do dev pelo caminho de "Deste projeto", acompanha até o fim, confere a produção só lendo | — |
| operação | `testador-funcionalidade`, `-fumaca`, `-caca-bug`, `-ui-ux`, `-permissoes` | `testadores/` (uma base, uma folha por especialidade) | Executam o roteiro no portal só pelo script; o script julga, o testador repassa a linha | `scripts/teste.cjs`, `dom.cjs` + testes; `.maestri-base/testadores.json` |
| opcional | `roadmap` | `roadmap/` | Pendências por módulo com códigos estáveis; deduz Plano e Status por planos, frentes e commits; HTML num portal | `scripts/roadmap.cjs`, `roadmap-lib.cjs`, `gerar-html.cjs` + teste; `.maestri-base/roadmap.json` |
| opcional | `integracoes` | `integracoes/` | Consulta, diagnostica e opera APIs externas a pedido do dev, do Orquestrador ou do joker; só conferência confirma; não coda o app | histórico em `.maestri-base/integracoes/operacoes/` |
| opcional | `pesquisador` | `pesquisador/` | Pesquisa no projeto e na web e entrega um Markdown na biblioteca (fatos com fontes, hipóteses e recomendações separados); não implementa | biblioteca em `docs/pesquisas/` com `index.md` |

Back e Front são bases separadas: entram no JSON como `papel: back` e `papel: front`, com `camada` e
`arquivo` em `papeis/back/` e `papeis/front/`; um item por camada. Papel fora do JSON está
desligado; cada base traz o contorno.

**Ferramenta compartilhada** (não é papel): leitor de credenciais em
`.maestri-base/ferramentas/credenciais/cred.cjs`, lido pelos scripts. Arquivo `.credenciais/acessos.env`
na raiz, fora do Git.

## Arquivos compartilhados

| Arquivo | Quem escreve | Quem lê |
|---|---|---|
| `.maestri-base/projeto.json` | adaptação e maestri-dev | todos os papéis (nenhum script) |
| `.maestri-base/frentes-ativas.md` (registro e crachá) | Orquestrador; joker ao delegar; cada um só a própria entrada | builders, revisor, testadores, roadmap (`roadmap-lib.cjs`) |
| `.maestri-base/frentes/<frente>/progresso.md` | Orquestrador | Orquestrador (retomada) |
| `.maestri-base/frentes/<frente>/revisao-pedido.md` | solicitante (ou o revisor, quando o dev pede direto) | `revisao.cjs captura` |
| `.maestri-base/frentes/<frente>/revisao.md`, capturas e `revisao-snap/` | revisor / só o script | solicitante; `revisao.cjs linha` |
| `.maestri-base/frentes/<frente>/testes/<especialidade>.md` + log e prints | responsável / só o script | `teste.cjs` |
| `.maestri-base/watchdog.json` · `.maestri-base/watchdog/` | adaptação e dev · só o script | `watchdog.cjs`; `watchdog/status.json` (só leitura) para achar o watchdog |
| `.maestri-base/testadores.json` · `.maestri-base/testadores/` | adaptação e dev · só o script | `teste.cjs` |
| `.maestri-base/roadmap.json` | adaptação e dev | `roadmap-lib.cjs` |
| `.maestri-base/integracoes/operacoes/` | integracoes (só alterações e operações incompletas, sem segredos) | integracoes (retomada) |
| `.maestri-base/integracoes/pendencias.md` | integracoes, quando a nota de pendências do dev não está conectada | dev |
| `<biblioteca>/AAAA-MM-DD-<assunto>/pesquisa.md` + `index.md` (padrão `docs/pesquisas/`) | pesquisador (no índice, só a própria entrada) | quem pediu; pesquisador (reuso) |
| `.maestri-base/decisoes/<papel>.md` | maestri-dev | maestri-dev |
| `<pasta de planos>/<data>-<assunto>/plan.md` (padrão `docs/plans/`) | planner; Orquestrador muda Status e Divergências | Orquestrador, revisor, `roadmap-lib.cjs` |
| `<pasta do roadmap>/*.md` (padrão `docs/roadmap/`) | roadmap; planner só a linha `Plano:` do item | `roadmap-lib.cjs`, planner |

## Acoplamentos (mudou um lado, mude o outro)

| # | Entre | O que é compartilhado | Quem faz cumprir |
|---|---|---|---|
| 1 | Orquestrador/joker → builders, revisor, testadores | **Crachá** no registro: entrada `### <frente> — <Área>` com `Orquestrador:` (nome exato do responsável), `Papel:`, `Equipe:` (nomes exatos do `maestri list`). Builders aceitam o Orquestrador do crachá, o joker e o dev, e recusam Orquestrador de outra frente; testadores aceitam só o responsável da entrada que os lista (o joker se registra com `Orquestrador: <seu nome>` e `Papel: joker`). Modelo em `orquestrador/references/frentes-ativas-modelo.md` | os modelos (nenhum script) |
| 2 | Orquestrador/joker → roadmap | `Item do roadmap: <código> \| nenhum` na entrada do registro = item em execução | `roadmap-lib.cjs` (`parseFrentesText`) |
| 3 | Orquestrador/joker → roadmap | Código do item entre parênteses **no fim do assunto** do commit (`fix(pedidos): corrige filtro (PED-004)`); o escopo não conta | `roadmap-lib.cjs` (`parseCommitSubject`) |
| 4 | Orquestrador/joker → roadmap | Aviso de andamento por `maestri ask` (código, `em execução`/`parado`/`feito`, resumo, commit se houver), aceito sem novo ok do dev quando o remetente tem a `responsabilidade` de um desses papéis no JSON. Sem plano, frente ou commit que sustente o Status, o roadmap grava `(manual)` + `- **Origem do status:** agente: <nome> · AAAA-MM-DD · <resumo>`; manual do dev prevalece; `cancelado` é só do dev. Contrato em `roadmap/SKILL.md` §2.2 e `roadmap/references/formato.md` | o modelo do roadmap |
| 5 | Planner → roadmap | Cabeçalho do `plan.md`: `- **Status:**` (`rascunho`/`aprovado`/`em execução`/`concluído`) e `- **Item do roadmap:**`; pasta de planos igual nos dois lados (`pasta_planos` no `roadmap.json`, padrão `docs/plans`). O planner acha o item por `## <código>` e, quando o plano vira `aprovado`, escreve só a linha `- **Plano:**` (`—` ou caminho a partir da raiz; mais de um, separados por vírgula). Contrato em `roadmap/references/formato.md` | `roadmap-lib.cjs` (`parsePlanText`, campo `Plano`) |
| 6 | Planner → Orquestrador | `plan.md` (modelo em `planner/references/plan-modelo.md`): Status, Depende de, Commit base, **Revisor: sim \| não — motivo**, **Testadores: <especialidades> \| nenhum**, critérios Dado/Quando/Então. O Orquestrador só executa `aprovado`, segue o Revisor e os testadores declarados e fecha com "Divergências da execução" + `concluído` | os modelos |
| 7 | Solicitante (Orquestrador, joker ou dev) ↔ revisor | `revisao-pedido.md` com `Frente`, `Solicitante`, `Origem` (`plano`/`pedido`), `Plano`, `HEAD` obrigatórios e `## Arquivos`, `## Decisões do dev`; `revisao.md` (`### Perguntas ao solicitante`); linha `REVISAO <frente> rodada N: ...`. Contrato em `revisor/SKILL.md` §2.1 e `revisor/references/relatorio.md` | `revisao.cjs` (`captura`, `linha`) |
| 8 | Orquestrador/joker ↔ testadores | Roteiro em `.maestri-base/frentes/<frente>/testes/<especialidade>.md` (contrato em `testadores/references/roteiro.md`; conferir com `teste.cjs valida`); linha final copiada literal no pacote; UI/UX só com `Portal visível confirmado pelo dev` no pedido; `encerra` antes do `maestri dismiss` | `teste.cjs` |
| 9 | Orquestrador e quem trabalha sem coordenador ↔ watchdog | Só o Orquestrador, o joker sozinho e o builder chamado direto pelo dev se conectam; quem um coordenador recrutou pede servidor a ele, que repassa e devolve a linha. Pedido `maestri ask "<watchdog>" "reinicie <servidor>"` com timeout ≥ 4 min, seguir só com `OK`; incidente `[Watchdog] Incidente #N` chega a quem coordena: arquivo da frente dele → `assumo #N como <nome>` e delega a correção a quem editou; fora da frente → só registra. Respostas `OK #N e seu` / `OCUPADO` / `FECHADO` / `INEXISTENTE`. Sem watchdog ativo, todos pedem ao dev. Contrato em `watchdog/SKILL.md` §3.1 (Orquestrador §2.10, Back e Front §2.6, joker §2.4 e §2.6 apontam para lá) | `watchdog.cjs` (`claim`); conexões no canvas, o dev |
| 10 | Watchdog → quem cuida de uma dependência (ex.: `deploy`) | `dependencias[].avisar_responsabilidade` no `watchdog.json`, comparada normalizada com a responsabilidade do `maestri list`; o texto do aviso vem de `pedido`. O Deploy faz o que o "Deste projeto" dele manda | `watchdog.cjs` |
| 11 | Testadores (Deploy e integracoes, opcional) → leitor de credenciais | `.maestri-base/ferramentas/credenciais/cred.cjs` (`readCreds`/`requireCreds`); chaves `ADMIN_EMAIL`/`ADMIN_PASSWORD` e `TESTE_<PERFIL>_EMAIL`/`_PASSWORD`. O `teste.cjs` procura o leitor três pastas acima da sua (`.maestri-base/papeis/testadores/scripts/` → `.maestri-base/`): mudou a instalação, mude o caminho | `teste.cjs` |
| 12 | Revisor ↔ quem guarda segredo | `.git`, `.env*` e `.credenciais` nunca entram numa captura nem são lidos | `revisao.cjs` (`PROTEGIDOS`) |
| 13 | Orquestrador ↔ builders | Camada que define o contrato vai primeiro; o Front prepara sem tipos ou campos provisórios; o passo de contrato roda uma vez só, por quem coordena | os modelos |
| 14 | Todos → `projeto.json` | Papéis ativos com `papel`, `responsabilidade`, `descricao`, `quando_chamar`, `base`, `arquivo`, `camada`. Agente do dev entra com `base: false` e os outros o chamam pela `descricao`/`quando_chamar`. Esquema no molde (só acrescentar campos) | os modelos |
| 15 | Orquestrador → deploy | A frente termina no commit; o Orquestrador não pede deploy e o Deploy recusa ordem de agente (padrão) | os modelos |
| 16 | Builders → cópia para o Codex | Quando o builder também é subagente, o arquivo e a cópia que o Codex lê ficam idênticos ("Deste projeto") | ninguém: `diff -q` pelo checklist |
| 17 | Todos | Linhas de resultado: `OK`/`FALHA`/`ALERTA`/`RECUSADO` (+ `OCUPADO`/`FECHADO`/`INEXISTENTE` no watchdog; `REVISAO` no revisor) | cada script |
| 18 | Todos | Nome da responsabilidade igual no Maestri, no JSON e na config dos scripts (`avisar_responsabilidade`) | comparação normalizada no `watchdog.cjs`; o resto, você |
| 19 | Dev, Orquestrador, joker → integracoes | Pedido com origem da autorização (pedido, plano ou adendo do dev), objetivo, identificadores e nome real para o retorno. Consultar ≠ corrigir: alteração só explícita e dentro da tarefa autorizada. Retorno separa confirmado, divergente, pendente de ação manual, parcial e não verificado. Fora do escopo vira pendência na nota do dev ou, sem nota conectada, em `.maestri-base/integracoes/pendencias.md`. Defeito de código volta como diagnóstico a quem pediu (correção é de builder ou joker). Contrato em `integracoes/SKILL.md` §2 | os modelos |
| 20 | Pesquisador → integracoes | Banco e API autenticada só por ele e **só consulta sem ação de negócio** (não basta ser GET); pedido traz origem, objetivo, identificadores, evidências e nome real; nunca autoriza escrita, mesmo citando outro papel. Contrato nos dois lados: `integracoes/SKILL.md` §2.5 e `pesquisador/SKILL.md` §3 | os modelos |
| 21 | Dev, planner, joker, Orquestrador → pesquisador | Pedido com objetivo, contexto, limites e nome real; quem pede escolhe modelo e effort, pode recrutar um por tarefa e reusa o mesmo para aprofundar; volta só o caminho do Markdown e uma mensagem curta. Contrato em `pesquisador/SKILL.md` §2.5 e §3 ("Para quem pede") | os modelos |
| 22 | Orquestrador ↔ joker | O Orquestrador aciona o joker quando fizer sentido, sem autorização prévia, para tarefa transversal ou investigação, e registra tarefa e motivo no progresso; o joker responde a ele e não commita (o commit é da frente). Contrato em `orquestrador/SKILL.md` §2.2 e `joker/SKILL.md` §2.4 | os modelos |

## Deste projeto

<!-- O maestri-dev mantém daqui para baixo. -->

- **Agentes do dev:** nenhum. (No workspace há 17 responsabilidades de `C:/Projects/automacao_contratos`, de outro projeto, fora do JSON: não mexa.)
- **Acoplamentos próprios:** Orquestrador e joker avisam o Deploy a cada commit (`maestri ask`); o Deploy pergunta ao dev se publica ou espera (decisão do dev em 2026-11-04).
- **Papéis descartados pelo dev:** `watchdog`, desligado por enquanto (escolha do dev); `front` e `testador-*`, sem front web (API backend-to-backend); `integracoes`, sem cliente de API externa.
- **Estado dos papéis:** instalados em 2026-11-04, aguardando uso. Prova ao vivo: não feita (nenhum papel frágil ligado: sem Watchdog nem testadores). Pendente: Deploy (URL pública, passo da migration em produção; o acesso à VPS é a conexão que o dev deixa de pé, D1 do Deploy); Orquestrador (comando exato da migration no banco de teste).
