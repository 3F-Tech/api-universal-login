# Credenciais (leitor compartilhado)

`cred.cjs` lê as credenciais de acesso do projeto para os scripts dos papéis (testadores e, depois,
Deploy e quem precisar). **O agente nunca abre, copia nem imprime o arquivo.** Segredo só passa
por script, e nenhuma função do leitor escreve valor na saída.

## Onde fica

`.credenciais/acessos.env`, na raiz do projeto do dev. **Nunca versione:** ponha no `.gitignore`

```
/.credenciais/
```

O Revisor já trata `.credenciais` como caminho protegido. Na instalação, a skill de adaptação copia
esta pasta para `.maestri-base/ferramentas/credenciais/` (os scripts dos papéis a procuram ali).

## Formato

Uma `CHAVE=valor` por linha. Linha vazia e `#` são ignoradas; aspas em volta do valor saem.

```
# conta principal (login padrão dos testadores)
ADMIN_EMAIL=
ADMIN_PASSWORD=

# um par por perfil de teste: TESTE_<PERFIL>_EMAIL e TESTE_<PERFIL>_PASSWORD (perfil em maiúsculas)
TESTE_VENDEDOR_EMAIL=
TESTE_VENDEDOR_PASSWORD=
```

Use contas de teste. O dev preenche o arquivo à mão; nenhum agente escreve nele.

## Conferir sem ver os valores

```
cd '<raiz>'; node .maestri-base/ferramentas/credenciais/cred.cjs --confere ADMIN_EMAIL ADMIN_PASSWORD
```

Responde `OK chave(s) presente(s) ...` ou `FALHA chave(s) ausente(s) ...: <nomes>`.

## Em script

```js
const { requireCreds, readCreds } = require('<pasta>/cred.cjs');
const { ADMIN_EMAIL, ADMIN_PASSWORD } = requireCreds(['ADMIN_EMAIL', 'ADMIN_PASSWORD'], { root });
```

`root` padrão = pasta atual. Erros citam só nomes de chaves. `MAESTRI_CRED_FILE` aponta para um
arquivo falso e existe só para teste. Testes: `node --test ferramentas/credenciais/cred.test.cjs`.
