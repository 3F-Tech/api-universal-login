# Decisões do Deploy

Visão do dev: o Deploy só lança na VPS; a infraestrutura de acesso (túnel/conexão) é do dev.

- **D1 · 2026-11-04 · Túnel já de pé:** quando chamado, o Deploy sempre terá o túnel/conexão com a VPS já de pé. Erguer túnel ou abrir SSH não é responsabilidade dele (só se o dev pedir); ele lança na VPS em que estiver conectado. Sem conexão: para e avisa o dev. Porquê: escolha do dev. Resolve o pendente "acesso SSH" do D9 em `_time.md` e dispensa o script de SSH com `cred.cjs` e as chaves `DEPLOY_SSH_*`.
