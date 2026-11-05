# Formato do roadmap (`<pasta do roadmap>/*.md`)

Os `.md` são a fonte. Quem lê: o dev, o `planner` (procura o item por `## <código>` ou por
`roadmap.cjs item <código>`) e os scripts (`scripts/roadmap-lib.cjs`). Por isso o formato é fixo: um
campo fora do lugar vira erro no `validar` e numa caixa vermelha no topo do `index.html`.

A pasta do roadmap (padrão `docs/roadmap/`), a de planos (padrão `docs/plans/`) e os módulos vêm de
`.maestri-base/roadmap.json` (exemplo em `config.exemplo.json`, ao lado desta pasta). Um roadmap
pronto, com o HTML gerado, está em `exemplo/`.

## Arquivo de módulo

Um arquivo por módulo, nome em minúsculas e sem acento (`<slug>.md`). O cabeçalho vem antes do
primeiro item:

```markdown
# Roadmap — Pedidos

- **Prefixo:** PED
- **Último código usado:** PED-005

<!-- Mantido pelo agente do roadmap. Formato: references/formato.md da base do papel roadmap -->
```

- Os módulos conhecidos estão em `modulos` no `.maestri-base/roadmap.json`: `slug` (nome do arquivo)
  → `nome` → `prefixo` (2 a 4 letras maiúsculas, sem repetir). Cada projeto tem os seus.
- O arquivo **só nasce com o primeiro item** do módulo: `roadmap.cjs codigo <modulo> --reservar` cria
  o arquivo com o cabeçalho. Módulo fora da configuração: o dev aprova nome e prefixo e o script
  recebe `--prefixo XYZ --nome "Nome"`. Daí em diante o cabeçalho do arquivo basta; acrescentar o
  módulo à configuração é opcional.
- `Último código usado` é escrito **só pelo script**. Ele garante que um código nunca volta a ser
  usado, nem depois de um item apagado, nem se um plano, uma frente ou um commit citar um código que
  já não existe.

## Item

Os itens vão um depois do outro, cada novo **no fim do arquivo**. A ordem no arquivo não importa: a
prioridade é um campo, e o `.html` ordena.

````markdown
## PED-003 — Total do pedido errado com cupom

- **Tipo:** Suporte/correção
- **Prioridade:** urgente
- **Tamanho:** pequeno
- **Status:** parado
- **Plano:** —
- **Feito:** —
- **Criado:** 2026-11-01

Quando o cliente usa um cupom de porcentagem, o total do pedido mostra o desconto aplicado duas
vezes. O total precisa bater com o valor cobrado.

<details><summary>Texto original do dev</summary>

```text
cupom de 10% ta dando 20% no total do pedido!!
```

</details>
````

Regras de cada parte (os valores são iguais em todo projeto):

| Parte | Regra |
|---|---|
| Título (`## CÓDIGO — Título`) | Código + travessão + título curto (até ~60 caracteres): o que muda e onde. O código nunca muda: nem com prioridade, nem com posição. Se o dev mudar o módulo, o item vai para o fim do arquivo do outro módulo **com o mesmo código** (o prefixo antigo é aceito) |
| Tipo | `Funcionalidade` · `Melhoria técnica` · `Suporte/correção` · `Dependência externa` · `Verificação` |
| Prioridade | `mínima` · `normal` · `alta` · `urgente` (padrão `normal`) |
| Tamanho | `pequeno` · `médio` · `grande` · `muito grande` (padrão `médio`) |
| Status | `parado` · `em execução` · `feito` · `cancelado`. Item novo começa em `parado`. `cancelado` só pode ser posto manualmente pelo dev. Qualquer valor posto **pelo dev** leva ` (manual)` no fim: `cancelado (manual)`. Sem a marca, a dedução pode corrigir |
| Plano | `—` ou o caminho do plano a partir da raiz: `docs/plans/2026-10-22-exportar-pedidos-csv/plan.md`. Mais de um: separados por vírgula. Quem escreve é o `planner`, quando o plano vira `aprovado`; é a única linha que ele escreve. O portal transforma a existência de um plano em `com plano` ou `sem plano` |
| Feito | `—` ou `AAAA-MM-DD · commit abc1234` (o commit é opcional, se o dev não souber: `AAAA-MM-DD`) |
| Criado | Data em que o item entrou no roadmap |
| Origem do status (opcional) | `agente: <nome> · AAAA-MM-DD · <resumo>` quando o `orquestrador` ou o `joker` informa um Status ainda não sustentado pela dedução. Use `Status: em execução (manual)` (ou `parado`/`feito`) para persistir o relato. Atualizações posteriores do agente podem substituí-lo; decisão manual do dev prevalece e remove esta origem. Cancelamento e reabertura de cancelado são exclusivos do dev |
| Descrição | Um ou mais parágrafos, logo depois dos campos (linha em branco antes). O **quê** e o **porquê**, para quem muda; nada de "como fazer" (é do planner). Sem títulos `#` dentro |
| Texto original | Bloco `<details>` com o texto do dev **literal**, dentro de cerca ```` ```text ````. Se o texto tiver ```` ``` ````, use `~~~text` como cerca. Item que recebeu complemento ganha um segundo bloco de texto, com a data, dentro do mesmo `<details>` |

Os valores são lidos sem acento e sem caixa (`medio` = `médio`), mas escreva sempre a grafia da
tabela. Campo a mais (ex.: `- **Bloqueia:** PED-004`) é aceito e ignorado pelo script.

## O que a dedução de Plano e Status lê

Os scripts casam sempre o **código exato**, por três fontes:

- **Planos** (`<pasta de planos>/<pasta>/plan.md`, no modelo da base do `planner`):
  - `- **Item do roadmap:** PED-003` (um ou mais códigos, ou `nenhum`);
  - `- **Status:** rascunho | aprovado | em execução | concluído` (o primeiro do arquivo).
- **Frentes ativas** (`.maestri-base/frentes-ativas.md`, registro do `orquestrador`): na entrada
  `### <frente>`, a linha `- Item do roadmap: PED-003`. O modelo comentado do arquivo é ignorado.
  Vale para qualquer entrada do registro, inclusive a de um `joker` que delegou.
- **Commits** (`git log` da branch atual): código entre parênteses no assunto, fora do escopo do
  Conventional Commits. Exemplos: `fix(pedidos): corrige total (PED-003)` e `(PED-003, PED-004)`.
  Não contam: `fix(PED-003): ...`, `PED-003` sem parênteses e `(PED-0030)`.

| Eixo | Regra |
|---|---|
| Plano | algum plano aponta para o código → `com plano`; nenhum aponta → `sem plano` |
| Status | plano `em execução` ou frente ativa → `em execução`; sem plano aberto e com todos os planos `concluído` ou commit com o código → `feito`; sem esses sinais → `parado` |

Precedência: **frente ativa > plano aberto > concluído/commit**. Um plano aberto (`rascunho`,
`aprovado` ou sem Status reconhecido) deixa o Status em `parado`, mas o pill Plano em `com plano`, e
vence a conclusão por commit; uma frente ativa vence qualquer conclusão. `cancelado` não é deduzido:
só diverge se aparecer sinal de execução ou conclusão.

Valor com `(manual)` nunca é sobrescrito pela dedução: a divergência vira pergunta ao dev, exceto
quando já explicada por relato registrado em `Origem do status`. Códigos citados em planos, frentes e
commits também contam para o "próximo código", que assim nunca reaproveita um número.

## `.maestri-base/roadmap.json`

| Campo | Padrão | O que é |
|---|---|---|
| `versao` | `1` | Versão do arquivo |
| `pasta_roadmap` | `docs/roadmap` | Onde ficam os `.md` e o `index.html` gerado |
| `pasta_planos` | `docs/plans` | Onde o planner grava `<pasta>/plan.md` |
| `registro_frentes` | `.maestri-base/frentes-ativas.md` | Registro de frentes dos Orquestradores |
| `portal` | `Roadmap` | Nome do portal do Maestri |
| `prefixo_commit` | `docs(roadmap): ` | Início obrigatório da mensagem do `commit` |
| `fuso_horario` | `America/Sao_Paulo` | Fuso da hora "gerado em" e das datas |
| `modulos` | `{}` | `slug` → `{ "nome", "prefixo" }` |

Caminhos são relativos à raiz. Sem o arquivo valem os padrões. Os scripts acham a raiz pela variável
`ROADMAP_ROOT` ou subindo da pasta atual (e depois da pasta do script) até a primeira com
`.maestri-base/`.
