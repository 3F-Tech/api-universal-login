# Segurança na revisão

Percorra em toda revisão; é curta. Revise o **diff** com o contexto das chamadas. Não execute
requisição, teste, portal ou consulta para demonstrar uma hipótese, e não leia segredos: a evidência é
caminho, linha e cenário. Os pontos de segurança próprios do projeto e os riscos conhecidos estão em
"Deste projeto" do `SKILL.md`. Não imponha boa prática que contrarie decisão explícita do dev.

## 1. Rota sem autenticação ou autorização

- Rota ou ação nova: por onde passa até o handler? Exige login? Confere o perfil certo?
- Público pode ser intencional: procure o mecanismo de acesso antes de apontar.
- Conhecer um ID não autoriza ler ou gravar o recurso: confira o dono e a relação pai/filho.
- Restrição só na interface não protege a API.
- A identidade e o perfil vêm da credencial validada, nunca de campo que o cliente controla (corpo,
  cabeçalho livre, parâmetro).

## 2. Payload sem validação

- A entrada é validada no servidor (tipo, formato, tamanho, campos obrigatórios)?
- Campos extras são recusados ou ignorados, sem gravar em massa o objeto recebido?
- Arquivo enviado tem tipo e tamanho limitados?

## 3. Segredo em log, resposta ou código

- Nenhum token, senha, chave ou conteúdo de `.env` em log, resposta, mensagem de erro ou código.
- Segredo novo vem de configuração, não fica escrito no código.

## 4. Webhook ou callback sem verificação

- A origem é verificada (assinatura, segredo compartilhado, token no caminho)?
- O mesmo evento recebido duas vezes não duplica efeito?
- Falha de verificação nega o pedido, sem processar parcialmente.

## 5. Injeção

- SQL montado com concatenação de entrada, em vez de parâmetro.
- Comando de sistema, caminho de arquivo ou expressão montados com entrada do usuário.
- HTML ou texto renderizado sem escapar o que veio do usuário.

## 6. Dado pessoal exposto

- A resposta devolve mais campos do que a tela usa (documento, e-mail, telefone, endereço)?
- Dado pessoal em log, URL ou mensagem para fora?
- Exportação ou listagem nova respeita o mesmo escopo de acesso da tela?

## Riscos conhecidos

Os do projeto ficam em "Deste projeto". Não reaponte o que já está lá como achado da frente.
