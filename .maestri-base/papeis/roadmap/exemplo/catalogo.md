# Roadmap — Catálogo

- **Prefixo:** CAT
- **Último código usado:** CAT-004

<!-- Mantido pelo agente do roadmap. Formato: references/formato.md da base do papel roadmap -->

## CAT-001 — Busca de produtos sem acento

- **Tipo:** Melhoria técnica
- **Prioridade:** normal
- **Tamanho:** médio
- **Status:** parado
- **Plano:** docs/plans/2026-10-25-busca-sem-acento/plan.md
- **Feito:** —
- **Criado:** 2026-10-24

A busca do catálogo acha "café" quando o cliente digita "cafe", e o contrário. Hoje a busca exige
o acento exato e devolve lista vazia.

<details><summary>Texto original do dev</summary>

```text
busca de produto nao acha nada se o cliente nao digita o acento
```

</details>

## CAT-002 — Trocar a biblioteca de redimensionar imagens

- **Tipo:** Dependência externa
- **Prioridade:** mínima
- **Tamanho:** grande
- **Status:** cancelado (manual)
- **Plano:** —
- **Feito:** —
- **Criado:** 2026-10-10

A biblioteca que redimensiona as fotos dos produtos deixou de ser mantida. Trocar por outra
mantida, sem mudar o tamanho das fotos publicadas.

<details><summary>Texto original do dev</summary>

```text
a lib de imagem ta abandonada, trocar
```

2026-10-30:

```text
deixa, a versao atual vai continuar recebendo correcao de seguranca
```

</details>

## CAT-003 — Conferir preços depois da importação

- **Tipo:** Verificação
- **Prioridade:** alta
- **Tamanho:** médio
- **Status:** em execução (manual)
- **Origem do status:** agente: Joker Catalogo · 2026-11-02 · iniciou a conferência, sem plano nem frente
- **Plano:** —
- **Feito:** —
- **Criado:** 2026-10-30

Depois da importação da planilha do fornecedor, conferir se os preços publicados batem com a
planilha, produto a produto, e listar os que divergem.

<details><summary>Texto original do dev</summary>

```text
confere se os precos da importacao bateram
```

</details>

## CAT-004 — Página de produto com variações

- **Tipo:** Funcionalidade
- **Prioridade:** normal
- **Tamanho:** muito grande
- **Status:** parado
- **Plano:** —
- **Feito:** —
- **Criado:** 2026-11-02

O mesmo produto passa a ter variações (tamanho e cor), cada uma com preço e estoque próprios,
escolhidas na página do produto antes de pôr no carrinho.

<details><summary>Texto original do dev</summary>

```text
produto com tamanho e cor, cada um com estoque
```

</details>
