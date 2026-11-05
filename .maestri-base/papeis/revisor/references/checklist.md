# Checklist da revisão

Leia com `../SKILL.md` e `relatorio.md`. Revise só a frente capturada e abra os chamadores para provar
efeitos, sem ampliar o escopo. Os itens do projeto ficam em "Deste projeto" do `SKILL.md`; percorra os
dois. A severidade abaixo é **típica**: classifique pelo cenário real e não promova risco hipotético
a P0/P1. Segurança tem folha própria (`seguranca.md`); não duplique o achado.

Um padrão suspeito sozinho não é bug. Catch vazio, `any`, `async` sem `await` ou log operacional podem
ser intencionais: consulte o contexto e as decisões do dev antes de apontar.

## 1. Código correto

1. **P1:** a mudança quebra chamadores, consumidores ou contratos existentes? Procure quem usa o que
   mudou.
2. **P1:** as bordas estão cobertas (vazio, nulo, zero, limite, lista grande, entrada repetida)?
3. **P1:** depois de gravar, alterar ou excluir, as telas e estados que mostram o dado são atualizados,
   sem cache velho e sem precisar recarregar a página?
4. **P1:** operação que pode repetir (reenvio, retry, clique duplo, tarefa agendada) não duplica nem
   corrompe dado?
5. **P1:** falha de carregamento não vira valor vazio gravado por cima do dado real ao salvar?
6. **P2:** erros são tratados com retorno útil, sem engolir exceção nem mostrar mensagem técnica ao
   usuário?
7. **P2:** os tipos e contratos entre camadas vêm da fonte gerada ou compartilhada do projeto, sem
   cópia manual divergente?
8. **P2:** o código segue os padrões do projeto e das regras locais da pasta?
9. **P2:** regra de negócio, cálculo, permissão ou validação alterados têm teste automatizado do caso
   que mudou? Não vale para texto ou estilo, nem quando o plano dispensou o teste. Teste entregue
   também é lido: `skip`/`only`, asserção sem efeito, mock da própria unidade testada ou dado que o
   sistema nunca devolveria é achado.
10. **P0/P1:** script ou rotina que altera dados em lote é idempotente, tem simulação e não chama
    integração externa sem ordem?

## 2. Documentação em dia

11. **P2:** as regras locais da pasta e o arquivo de instruções acompanham a mudança? Módulo novo tem
    regra local, se o projeto usa esse padrão?
12. **P2:** regra de negócio nova aprovada pelo dev está registrada onde o projeto manda?
13. **P2:** a documentação da API ou do contrato descreve o que foi implementado (rota, entrada,
    respostas)?
14. **P2:** algum documento afetado contradiz o código novo?
15. **P2:** a evidência citada (build, geração de código, teste) se refere a esta versão da frente, e
    não a uma anterior? Pergunte; não rode comandos.

## 3. Sobras

16. **P3:** ficou log de debug no caminho normal? Diferencie de log operacional útil.
17. **P3:** ficou código comentado de experimento junto da solução?
18. **P3:** TODO novo tem contexto, sem adiar parte exigida da entrega? Falta funcional pode ser P1/P2.
19. **P1/P3:** flag, valor fixo ou dado de teste altera produção ou aparece como dado real?
20. **P1/P3:** rota ou tela de teste/diagnóstico nova tem motivo aprovado para ficar? Se expõe algo,
    avalie em `seguranca.md`.
21. **P3:** arquivo temporário de diagnóstico entrou na entrega?
22. **P2/P3:** refatoração de carona ou requisito que ninguém pediu entrou sem decisão do dev?

## Como concluir

Para cada candidato a achado, prove um cenário concreto e aponte `Onde:` no código ou documento.
Sem cenário, não entra.
