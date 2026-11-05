# <Título do plano>

<!-- Copie para <pasta de planos>/AAAA-MM-DD-<assunto>/plan.md.
     As nove seções e sua ordem são fixas; reduza o conteúdo à frente, sem preenchimento artificial.
     Uma linha ou "não se aplica" basta quando couber; §9 fica vazia no planejamento.
     Âncoras por nome (função, rota, componente, campo), nunca por número de linha.
     Remova os comentários e substitua os guias antes de aprovar. -->

## 1. Cabeçalho

- **Objetivo:** <o que muda para quem usa, em uma ou duas frases>
- **Módulo:** <área da mudança; ex.: Pedidos>
- **Status:** rascunho
  <!-- rascunho → aprovado (dev aprovou) → em execução → concluído (executor encerrou) -->
- **Origem:** pedido direto | roadmap | revisão de <AAAA-MM-DD>
<!-- Inclua a linha seguinte só com roadmap ativo; sem item vinculado, use "nenhum". -->
- **Item do roadmap:** <código> | nenhum
- **Data:** <AAAA-MM-DD do início do planejamento>
- **Commit base:** <hash do HEAD; sem commit inicial, registre essa limitação no Contexto>
- **Depende de:** nenhum | `<pasta de planos>/<outro plano>/plan.md` concluído
- **Entrevista:** `grill.md` <!-- ou caminho do grill comum, se houver vários planos -->
- **Revisor:** sim | não — <motivo confirmado com o dev; desligado não é oferecido>
- **Testadores:** <especialidades ativas confirmadas com o dev> | nenhum

## 2. Contexto

- **Por quê:** <problema e origem do pedido>
- **Como é hoje:** <com caminhos e âncoras; ex.: `listarPedidos`, `GET /pedidos`, `ListaPedidos`>
- **Instruções e regras locais:** <caminhos e regras aplicáveis>
- **Imagens:** nenhuma | <`imagens/tela.png` — o que mostra>
- **Fontes externas:** nenhuma | <link — o que embasou>
- **Observações:** <mudanças não commitadas e limitações do commit base, se houver>

## 3. Registro de decisões

<!-- Decisões de negócio, revisão e testes, com ligação às perguntas do grill.
     Preserve a versão anterior de uma decisão revisada e explique por que mudou. -->

- **D1** — <decisão> (P1)
- **D2** — ~~<versão antiga>~~ → <versão nova> · *revisada em P7: <motivo>*

## 4. Escolhas técnicas aprovadas

<!-- Escolhas do planner pelos padrões do projeto, apresentadas no resumo técnico ao dev.
     Inclua só o que a frente precisar, com o porquê. -->

- <solução e reaproveitamentos> — <motivo>
- <divisão por camada, contratos e permissões quando aplicáveis> — <motivo>
- **Passo de contrato entre camadas:** não se aplica | <comando, responsável e ordem>
- **Alterações de dados/estrutura:** não se aplica | <o que muda e procedimento do projeto>

## 5. Etapas

<!-- Ordene por dependência; cada etapa tem responsável por papel/camada, sem fixar terminal.
     Testes automatizados por etapa só se já existe suíte ou se o dev pediu.
     Integração entre camadas usa o contrato real; preparo independente pode ocorrer em paralelo. -->

### E1 — <entrega curta>

- **Quem:** <papel/camada; ex.: builder da camada api>
- **O quê:** <ação e resultado, sem escolha de negócio restante>
- **Arquivos e âncoras:** <caminhos e nomes>
- **Dados/estrutura:** não se aplica | <alteração e procedimento definido>
- **Testes:** <T da seção 7 a criar/ajustar> | não se aplica — <motivo>
- **Depende de:** nenhuma | E<n>
- **Cobre:** CA<n>
- **Imagens:** <caminho, somente se houver>

<!-- Exemplo condicional: inclua E2 apenas se o projeto tiver passo de contrato entre camadas.
     Substitua pelo passo real, completo; remova este exemplo se não se aplicar. -->

### E2 — Passo de contrato entre camadas

- **Quem:** <responsável definido pelo projeto>
- **O quê:** <comando e artefatos reais; ex.: gerar tipos/cliente após a camada api>
- **Arquivos e âncoras:** <origem do contrato e saídas>
- **Testes:** <verificação do contrato prevista na seção 7>
- **Depende de:** E1; só depois liberar a integração da camada consumidora
- **Cobre:** CA<n>

## 6. Critérios de aceite

<!-- Sempre presentes, um por comportamento; resultados observáveis, inclusive falhas e bordas. -->

- **CA1** — **Dado** <estado inicial>, **Quando** <ação>, **Então** <resultado observável>.
- **CA2** — **Dado** <outro cenário>, **Quando** <ação>, **Então** <resultado observável>.

## 7. Testes

### Testes automatizados do projeto (se houver)

<!-- Com suíte existente ou pedido do dev: testes por etapa e comandos reais do projeto.
     Sem ambos: "não se aplica — sem suíte e sem solicitação".
     Isolamento, dados e ambientes seguem as políticas do dev, sem presumir ambiente seguro. -->

- **T1** (E1, `<arquivo de teste>`) — <cenário> · cobre CA<n> · <preparação/isolamento necessário>
- **Comandos:** <comandos da suíte existente ou da abordagem pedida pelo dev>

### Navegação pelos testadores (se declarados)

<!-- Especialidades são as declaradas no cabeçalho, disponíveis no JSON e confirmadas no grill.
     Descreva escopo e resultados; o executor deriva o roteiro pela base de cada testador.
     Com Testadores: nenhum, escreva "não se aplica — nenhum testador declarado". -->

- **Tela/rota:** <nome e caminho> · **Especialidade:** <declarada no cabeçalho>
  · **Perfil:** <se houver> · **Dado de teste:** <registro/valores sem segredos>
  · **Ações e esperado:** <sequência e resultados observáveis> · **Cobre:** CA<n>
  · **Cuidados:** <os definidos com o dev, quando houver>
  · **Pré-requisitos:** <ambiente, dados, credenciais por perfil, sem valores secretos>

### Verificação pelo dev

não se aplica | <passos e resultados para critérios sem cobertura por agente ou suíte;
trechos reservados pelo dev ficam como "teste pelo dev", sem afirmar aprovação antecipada>

## 8. Fora do escopo

- <o que fica de fora e por quê; ou "não se aplica">

## 9. Divergências da execução

<!-- Vazia no planejamento. O executor registra diferenças, ajustes de atualidade,
     adendos do dev e falhas do plano durante a execução. -->
