# Convenções, lições e checklist de mudança

Caminhos relativos à raiz do projeto. O que "Deste projeto" do maestri-dev disser vale sobre isto.

## Como um agente é feito

- **Arquivo do papel:** pasta com `SKILL.md` (obrigatório), `references/` (detalhe lido sob demanda) e
  `scripts/` (se houver). Padrão de instalação: `.maestri-base/papeis/<pasta>/`. O caminho real de cada
  papel é o `arquivo` no `projeto.json`. Builders também servem de subagente (o mesmo arquivo em
  `.claude/agents/`), com cópia idêntica onde o Codex lê ("Deste projeto").
- **Molde do `SKILL.md`:** frontmatter `name` (igual à pasta) e `description` (o que faz e em qual
  terminal). Seções nesta ordem: propósito (2–3 linhas), Boot, Como trabalha, Com quem fala, Fixo ×
  ajustável, Papéis desligados (se couber), Skills sugeridas, `## Deste projeto` por último. Precedência
  das regras do projeto no topo; nota do `cd "<raiz>"` e do PowerShell 5.1. Outro papel é citado pelo
  `papel` da base; o nome real vem do `maestri list`. Contrato com outro papel vive na base de quem o
  executa; os outros só apontam. Todo padrão é declarado como padrão, trocável em "Deste projeto". Sem
  remendos datados: se a regra vale, escreva a regra. Alvo de até ~15 KB no `SKILL.md`.
- **Responsabilidade = ponteiro para o arquivo,** nunca "invoque a skill" (o Codex não enxerga as skills
  do Claude Code):
  `Você é o <Papel> deste projeto. Leia e siga à risca <caminho absoluto>/SKILL.md.`
  Os testadores usam o mesmo `SKILL.md` nas cinco responsabilidades; a folha sai da responsabilidade.
- **Nome da responsabilidade:** minúsculo com hífen (`testador-ui-ux`). O `--role` não diferencia
  maiúscula, mas espaço ≠ hífen. O nome no Maestri, no JSON e em qualquer script tem de ser o mesmo.
  Comandos `maestri role ...` são só do Maestro.
- **Independente de CLI, sem presets:** o mesmo papel roda em Claude Code ou Codex. Nada que dependa de
  ferramenta de um CLI só, salvo exceção declarada na base (o Watchdog usa o `Monitor` → só Claude
  Code). Modelo e effort vêm do comando de recrutamento (`--command`), não do arquivo.
- **Ação arriscada ou repetitiva vira subcomando de script** (Node puro, sem dependência nova,
  `execFileSync` sem shell) que termina em **uma linha** `OK`/`FALHA`/`ALERTA`/`RECUSADO`. O modelo
  repassa a linha, não julga. O que é do projeto fica num JSON em `.maestri-base/`, não no código. Toda
  interface de script tem teste `node:test` com dados falsos e pasta temporária.
- **Credenciais:** `.credenciais/acessos.env` na raiz, fora do Git. Agente nunca lê; só script, pelo
  leitor compartilhado `.maestri-base/ferramentas/credenciais/cred.cjs` (`readCreds`/`requireCreds`;
  erros citam só nomes de chave). Arquivo falso para teste: variável `MAESTRI_CRED_FILE`.
- **Texto para modelo fraco ou gratuito** (testadores, watchdog): curto, imperativo, lista fechada de
  comandos, inteligência no roteiro e no script. Para modelo forte (Revisor, Orquestrador): direto, com
  o porquê das regras.
- **JSON do projeto:** só entra o que um papel ou script precisa ler de forma estruturada. Só
  **acrescente** campos; nunca renomeie, remova nem mude o sentido de um campo. Valide com
  `node -e "JSON.parse(require('fs').readFileSync('.maestri-base/projeto.json','utf8'))"`.
- **Registro das decisões:** `.maestri-base/decisoes/<papel>.md` com a visão do dev e as decisões
  numeradas (D1, D2...). Mudança pedida pelo dev entra como decisão nova ou "D7 revista em <data>: ...".

## Lições aprendidas (não repita)

- `maestri ask` em background **volta antes** de o agente terminar (snapshot); a resposta de verdade
  chega depois como mensagem nova. Não reenvie achando que falhou: confira com `maestri check`.
- `maestri ask --batch` exige **JSON** (`'{"A": "...", "B": "..."}'`). Com dois argumentos soltos ele
  falha com "Invalid --batch JSON" e **não envia nada**. Na dúvida, um `ask` por agente.
- Um Codex pode estar parado num **menu do próprio CLI** (ex.: aviso de limite oferecendo trocar de
  modelo). O pedido não chega até o menu fechar. Escolha de modelo ou crédito é do dev.
- `maestri dismiss` **deixa o portal órfão**: o testador roda `encerra` (fecha o portal) antes do
  dismiss.
- O texto do `maestri ask` no **PowerShell 5.1** perde aspas duplas internas; `&&` não existe.
- O terminal de uma responsabilidade volta para a pasta dela a cada comando: todo comando começa com
  `cd "<raiz>"`. No Windows, escreva a raiz com a mesma caixa do disco; grafia diferente já quebrou
  ferramentas de build e de navegador.
- Não edite arquivo por redirecionamento no PowerShell 5.1 (`>`, `Out-File`, `Set-Content`): estraga os
  acentos. Use a ferramenta de edição. Arquivos podem vir com BOM; os scripts o ignoram.
- Trocar o texto de uma responsabilidade em uso pode desligar o vínculo dos terminais (já apareceu
  "0 terminais" em papéis que estavam no ar). Avise o dev antes.
- Revisão de entrega: **nunca aceite o relatório como prova**. Rode os testes do script e leia os
  arquivos principais. Um formato compartilhado entre dois agentes só está certo quando o exemplo de um
  passa no parser do outro.
- Nome de responsabilidade escrito diferente no código e no Maestri quebra o vínculo **em silêncio**
  (um script deixou de achar o papel que devia avisar). Compare normalizando e cite o nome real.
- Delegar a escrita de um texto exato custa mais do que escrever direto. Delegue quando o briefing for
  bem menor do que o que o executor vai ler ou produzir.

## Checklist de mudança (ao alterar ou criar um agente)

1. Arquivo de decisões do agente: nova decisão registrada, com data.
2. Arquivo do papel e, se houver, script + testes (`node --test ...` passando).
3. O **outro lado** de cada acoplamento (`time.md`) que a mudança toca.
4. Cópias para o Codex ("Deste projeto"): mantenha **idênticas** (copie e confira com `diff -q`).
5. Arquivo de instruções do projeto, se ele descreve o time (quem faz o quê, fluxo). Regra que todos os
   papéis seguem não vai na parte de orquestração, que o joker ignora.
6. `projeto.json`: papel novo, desligado ou mudado (`descricao`, `quando_chamar`, `arquivo`); JSON
   validado.
7. Responsabilidade no Maestri (`maestri role create` / `role edit`), com aviso ao dev se estiver em uso.
8. `references/time.md` deste agente (você mesmo mantém este mapa).
9. Nota de pendências do dev: o que ele precisa testar ou decidir.
10. Relatório ao dev: o que mudou, o que foi testado e o que não foi, e as decisões que você tomou
    sozinho.
