# Relatório da revisão

Escreva só `.maestri-base/frentes/<frente>/revisao.md`, uma seção por rodada capturada. Não edite o
pedido de um agente, o código, a documentação nem as provas do script. Preserve as rodadas anteriores.
Os exemplos abaixo são fictícios.

## Regras do formato

- Cabeçalho da rodada: `## Rodada N — AAAA-MM-DD HH:MM — HEAD <hash>`, com N igual ao da captura.
- Achado: `### R<N>-<nº> · P0|P1|P2|P3 · <bloco>`, com ID único (ex.: `R1-01`). Blocos: `código`,
  `segurança`, `documentação`, `sobra`. Severidade e bloco são independentes.
- Campos obrigatórios: `- Onde: caminho:linha` e `- Cenário: ...`. Os nomes dos campos ignoram acento.
- **Sem cenário concreto não entra.** Diga qual entrada, perfil ou estado leva a qual caminho e qual
  resultado errado aparece. Em documentação ou sobra, diga a consequência; não invente bug de
  execução para justificar higiene.
- `- Correção sugerida:` é opcional. Quando trivial, traga o trecho exato, sem editar.
- Dúvida vai em `### Perguntas ao solicitante`, com `- Q1: ...`. Achado que depende dela leva
  `- Condicional: Q1`. Continue a revisão.
- Da rodada 2 em diante, registre `### Conferência da rodada anterior` com cada ID anterior:
  `corrigido`, `não corrigido` ou `corrigido com problema → R<N>-<nº>`.
- Sem achados, escreva `Nenhum achado.` no lugar dos achados. A conferência continua obrigatória na
  rodada 2 em diante.
- `## Preexistente, fora da frente` é seção **única**, no fim do arquivo, acumulada entre as rodadas.
  Não entra na contagem e não trava.

## Exemplo: duas rodadas no mesmo arquivo

```markdown
## Rodada 1 — 2026-10-26 14:05 — HEAD 303407e

### R1-01 · P1 · código
- Onde: apps/web/src/components/pedidos/EditarPedido.vue:42
- Cenário: com a lista de pedidos aberta, salvar uma alteração emite `alterado`, mas a tela pai não escuta o evento. A lista mostra o valor antigo até recarregar a página.
- Correção sugerida: ligar o evento ao mesmo recarregamento que a tela pai já usa depois de excluir.

### R1-02 · P2 · documentação
- Onde: apps/api/src/services/pedidos/regras.md:18
- Cenário: a regra diz que enviar nulo apaga o vínculo, mas o handler novo recusa nulo. Quem seguir a documentação recebe 400 e não consegue remover o vínculo.
- Condicional: Q1

### Perguntas ao solicitante
- Q1: Remover o vínculo com nulo continua no escopo ou o dev decidiu impedir essa operação?

## Rodada 2 — 2026-10-26 14:45 — HEAD 303407e

### R2-01 · P1 · código
- Onde: apps/web/src/views/pedidos/ListaPedidos.vue:87
- Cenário: a correção ligou `alterado` ao recarregamento, mas o delta removeu o mesmo listener do fluxo de exclusão. Excluir um pedido deixa a linha na lista até recarregar a página.
- Correção sugerida: manter o listener de exclusão junto do novo.

### Conferência da rodada anterior
- R1-01: corrigido com problema → R2-01
- R1-02: corrigido

## Preexistente, fora da frente
- apps/web/src/views/pedidos/PainelAntigo.vue:12: texto em outro idioma já existia; não veio da frente.
```

Rodada limpa:

```markdown
## Rodada 1 — 2026-10-26 14:05 — HEAD 303407e
Nenhum achado.
```

## Validação e retorno

Depois de escrever a rodada, rode `node "<pasta do SKILL.md>/scripts/revisao.cjs" linha <frente>` a
partir da raiz. O script valida a **última** rodada e confere se ela bate com a última captura. Uma
recusa como `RECUSADO relatório: R1-03 sem cenário` pede correção do relatório. Validado, repasse ao
solicitante só a linha:

```text
REVISAO <frente> rodada N: X P0, Y P1, Z P2, W P3, Q perguntas — <caminho do revisao.md>
REVISAO <frente> rodada N: limpa — <caminho do revisao.md>
```

O trecho de perguntas só aparece quando há perguntas. Não reescreva a contagem nem diga que está
pronto para commit. Aceite de risco, descarte e correção são do solicitante e ficam no histórico.
