# Decisões do time

Visão do dev: não declarada na adaptação.

- **D1 · 2026-11-04 · Banco local:** banco de teste na VPS; o `.env` local escolhe o banco (só o dev troca). O túnel `localhost:5433` leva ao banco de teste (`3f_core_staging`); produção é o `3f_core` (confirmado pelo dev em 2026-11-04). Porquê: o projeto passou a ter banco de teste.
- **D2 · 2026-11-04 · Commit e push:** Orquestrador e joker commitam depois do "aprovado" do dev e, a cada commit, avisam o Deploy, que pergunta ao dev se dá push e publica ou espera. Ninguém mais dá push. Porquê: escolha do dev (troca a preferência antiga de "o dev sempre commita").
- **D3 · 2026-11-04 · Modelos:** builders em Sonnet (Claude Code) ou gpt-6-luna (Codex), effort `high`. Revisor e demais no padrão da base. Porquê: escolha do dev.
- **D4 · 2026-11-04 · Git de .maestri-base/:** versionado (padrão). Porquê: padrão aceito.
- **D5 · 2026-11-04 · Mudança de banco:** migrations do Prisma (troca a regra do `CLAUDE.md` de schema só por introspecção e sem migrations). O Back escreve; quem coordena aplica no banco de teste e roda `prisma:generate`; em produção, na maioria das vezes pelo Deploy com ordem do dev. Comando exato: pendente, o Orquestrador confirma na primeira frente.
- **D6 · 2026-11-04 · Papéis fora:** `watchdog`, desligado por enquanto (escolha do dev); `front` e `testador-*`, sem front web; `integracoes`, sem cliente de API externa.
- **D7 · 2026-11-04 · Coletor de consumo:** instalado.
- **D8 · 2026-11-04 · Nomes das responsabilidades:** sufixo `-3f-core` nos papéis que colidiam com responsabilidades de `C:/Projects/automacao_contratos` no mesmo workspace (`orquestrador`, `joker`, `back`, `revisor`, `pesquisador`, `maestri-dev`). `planner`, `roadmap` e `deploy` sem sufixo. Porquê: escolha do dev (em vez de `-base`).
- **D9 · 2026-11-04 · Deploy ligado:** caminho manual na VPS (`git pull`, `npm i`, `npx prisma generate`, `npm run build`, `pm2 restart api-universal-login`, `pm2 save`), passado pelo dev. Pendentes: acesso SSH, URL pública, passo da migration.
- **D9 revista em 2026-11-04:** acesso SSH deixou de ser pendente: o túnel/conexão com a VPS já vem de pé pelo dev (ver `decisoes/deploy.md` D1).
- **D10 · 2026-11-04 · Back sem subagente:** o projeto não usa `.claude/agents/`.
