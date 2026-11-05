# Roadmap — Pedidos

- **Prefixo:** PED
- **Último código usado:** PED-005

<!-- Mantido pelo agente do roadmap. Formato: references/formato.md da base do papel roadmap -->

## PED-001 — Filtro de pedidos por período

- **Tipo:** Funcionalidade
- **Prioridade:** alta
- **Tamanho:** pequeno
- **Status:** parado
- **Plano:** —
- **Feito:** —
- **Criado:** 2026-10-20

O atendimento filtra a lista de pedidos por período (data inicial e final), do mesmo jeito que já
filtra por status, para responder ao cliente sem rolar a lista inteira.

<details><summary>Texto original do dev</summary>

```text
precisa filtrar pedido por data, o pessoal do atendimento fica rolando a lista toda
```

</details>

## PED-002 — Exportar pedidos em CSV

- **Tipo:** Funcionalidade
- **Prioridade:** normal
- **Tamanho:** médio
- **Status:** em execução
- **Plano:** docs/plans/2026-10-22-exportar-pedidos-csv/plan.md
- **Feito:** —
- **Criado:** 2026-10-21

A lista de pedidos ganha um botão que baixa os pedidos filtrados em CSV, para a conferência mensal
ser feita na planilha sem copiar linha por linha.

<details><summary>Texto original do dev</summary>

```text
botao pra exportar os pedidos em csv
```

</details>

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

## PED-004 — Status "enviado" some do filtro

- **Tipo:** Suporte/correção
- **Prioridade:** normal
- **Tamanho:** pequeno
- **Status:** feito
- **Plano:** —
- **Feito:** 2026-10-28 · commit 1a2b3c4
- **Criado:** 2026-10-27

O filtro de status da lista de pedidos não oferece a opção "enviado", e os pedidos nesse status só
aparecem com o filtro limpo.

<details><summary>Texto original do dev</summary>

```text
nao tem enviado no filtro de status
```

</details>
