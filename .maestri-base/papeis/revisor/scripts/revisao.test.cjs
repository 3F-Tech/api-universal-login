'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { parsePedido, parseReport, createReviewer } = require('./revisao.cjs');
const SCRIPT = path.join(__dirname, 'revisao.cjs');

function request(head, files = ['apps/api/src/routes/index.ts', 'novo.txt']) {
  return `Frente: exemplo\nSolicitante: Orquestrador Exemplo\nOrigem: pedido\nPlano: —\nHEAD: ${head}\nEffort: high\n\n## Pedido\nAdicionar uma rota de exemplo.\n\n## Arquivos\n${files.map((f) => '- ' + f).join('\n')}\n\n## Decisões do dev\n- Não emitir nada.\n`;
}
const report = (n, head, body = 'Nenhum achado.') => `## Rodada ${n} — 2026-10-26 14:05 — HEAD ${head}\n\n${body}\n`;
const finding = (id = 'R1-01') => `### ${id} · P1 · segurança\n- Onde: apps/api/src/routes/index.ts:2\n- Cenário: usuário sem login acessa a rota nova e recebe dados de outro cliente.\n`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'revisor-unit-'));
  t.after(() => {
    const resolved = fs.realpathSync.native(root);
    const temp = fs.realpathSync.native(os.tmpdir());
    assert.equal(path.dirname(resolved).toLowerCase(), temp.toLowerCase());
    assert.ok(path.basename(resolved).startsWith('revisor-unit-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  fs.mkdirSync(path.join(root, 'apps/api/src/routes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/api/src/routes/index.ts'), 'const original = 1;\n');
  fs.writeFileSync(path.join(root, 'estavel.md'), 'Sem mudança.\n');
  git('add', 'apps', 'estavel.md'); git('commit', '-qm', 'fixture');
  const head = git('rev-parse', 'HEAD');
  const dir = path.join(root, '.maestri-base/frentes/exemplo'); fs.mkdirSync(dir, { recursive: true });
  const pedido = path.join(dir, 'revisao-pedido.md');
  fs.writeFileSync(pedido, request(head));
  return { root, dir, pedido, head, git, reviewer: createReviewer(root) };
}

test('pedido: formato fixo, caixa/acento, seções e origem plano', () => {
  const p = parsePedido(request('303407e').replace('Decisões', 'DECISOES').replace('Frente:', 'FRENTE:'));
  assert.equal(p.front, 'exemplo'); assert.equal(p.files.length, 2);
  assert.match(p.sections['decisoes do dev'][0], /emitir/);
  assert.throws(() => parsePedido(request('303407e').replace('HEAD: 303407e\n', '')), /falta head/);
  assert.doesNotThrow(() => parsePedido(request('303407e').replace('Effort: high\n', '')));
  assert.doesNotThrow(() => parsePedido(request('303407e').replace('Effort: high', 'Effort: low')));
  assert.throws(() => parsePedido(request('303407e').replace('Solicitante: Orquestrador Exemplo\n', '')), /falta solicitante/);
  assert.throws(() => parsePedido(request('303407e').replace('Solicitante:', 'Orquestrador:')), /falta solicitante/);
  assert.throws(() => parsePedido(request('303407e').replace('Origem: pedido', 'Origem: plano')), /exige Plano/);
  assert.throws(() => parsePedido(request('303407e', ['.env'])), /protegido/);
  assert.throws(() => parsePedido(request('303407e', ['../outro'])), /relativo/);
  assert.throws(() => parsePedido(request('303407e', ['a', 'a'])), /duplicado/);
});
test('captura contém staged+unstaged, novo completo, avisos e delta da rodada 2', (t) => {
  const f = fixture(t);
  const tracked = path.join(f.root, 'apps/api/src/routes/index.ts');
  fs.writeFileSync(tracked, 'const staged = 2;\n'); f.git('add', 'apps/api/src/routes/index.ts');
  fs.appendFileSync(tracked, 'router.get("/x", handler);\n');
  fs.writeFileSync(path.join(f.root, 'novo.txt'), 'novo inteiro\nsegunda linha');
  fs.writeFileSync(f.pedido, request(f.head, ['apps/api/src/routes/index.ts', 'novo.txt', 'estavel.md', 'sumiu.txt']));
  const index = f.git('ls-files', '--stage');
  const out = f.reviewer.run(['captura', f.pedido]);
  assert.match(out, /OK rodada 1: 4 arquivos/); assert.doesNotMatch(out, /áreas/); assert.match(out, /sem mudança.*estavel/); assert.match(out, /não existe.*sumiu/);
  const patch = fs.readFileSync(path.join(f.dir, 'revisao-r1.patch'), 'utf8');
  assert.match(patch, /staged = 2/); assert.match(patch, /router.get/); assert.match(patch, /novo inteiro/); assert.match(patch, /No newline/);
  assert.equal(fs.readFileSync(path.join(f.dir, 'revisao-snap/r1/arquivos/novo.txt'), 'utf8'), 'novo inteiro\nsegunda linha');
  fs.writeFileSync(tracked, 'const corrigido = 3;\n');
  fs.unlinkSync(path.join(f.root, 'novo.txt'));
  const out2 = f.reviewer.run(['captura', f.pedido]);
  assert.match(out2, /OK rodada 2/); assert.match(out2, /delta em/);
  const delta = fs.readFileSync(path.join(f.dir, 'revisao-delta-r2.patch'), 'utf8');
  assert.match(delta, /corrigido = 3/); assert.match(delta, /novo inteiro/);
  assert.equal(f.git('ls-files', '--stage'), index);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
});
test('linha válida com condicional/pergunta, limpa e recusada', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'novo.txt'), 'exemplo');
  f.reviewer.run(['captura', f.pedido]);
  const file = path.join(f.dir, 'revisao.md');
  fs.writeFileSync(file, report(1, f.head, finding() + '- Condicional: Q1\n\n### Perguntas ao solicitante\n- Q1: A rota deveria ser pública?\n') + '\n## Preexistente, fora da frente\n- antigo\n');
  assert.match(f.reviewer.run(['linha', 'exemplo']), /^REVISAO exemplo rodada 1: 0 P0, 1 P1, 0 P2, 0 P3, 1 perguntas/);
  fs.writeFileSync(file, report(1, f.head));
  assert.match(f.reviewer.run(['linha', 'exemplo']), /rodada 1: limpa/);
  fs.writeFileSync(file, report(1, f.head, '### R1-03 · P2 · documentação\n- Onde: estavel.md:1\n'));
  assert.throws(() => f.reviewer.run(['linha', 'exemplo']), /R1-03 sem cenário/);
});
test('relatório recusa severidade, bloco, campo, duplicata e pergunta ausente', () => {
  assert.throws(() => parseReport(report(1, '303407e', finding().replace('P1', 'P9'))), /severidade/);
  assert.throws(() => parseReport(report(1, '303407e', finding().replace('segurança', 'estilo'))), /bloco/);
  assert.throws(() => parseReport(report(1, '303407e', finding().replace('index.ts:2', 'index.ts'))), /sem Onde/);
  assert.throws(() => parseReport(report(1, '303407e', finding() + finding())), /duplicado/);
  assert.throws(() => parseReport(report(1, '303407e', finding() + '- Condicional: Q1\n')), /sem pergunta/);
  assert.throws(() => parseReport(report(1, '303407e', finding() + 'Nenhum achado.')), /contradiz/);
  assert.throws(() => parseReport(report(2, '303407e')), /consecutivas/);
});
test('rodada 2 exige conferência anterior e link de problema válido', () => {
  const first = report(1, '303407e', finding());
  assert.throws(() => parseReport(first + report(2, '303407e')), /falta Conferência/);
  assert.throws(() => parseReport(first + report(2, '303407e', 'Nenhum achado.\n### Conferência da rodada anterior')), /falta conferência de R1-01/);
  const next = report(2, '303407e', 'Nenhum achado.\n### Conferência da rodada anterior\n- R1-01: corrigido');
  assert.equal(parseReport(first + next).n, 2);
  assert.throws(() => parseReport(first + next.replace('corrigido', 'corrigido com problema → R2-02')), /referência desconhecida/);
  const bad = first + report(2, '303407e', finding('R2-02') + '### Conferência da rodada anterior\n- R1-01: corrigido com problema → R2-02');
  assert.equal(parseReport(bad).findings.length, 1);
});
test('cerca não injeta achados ou perguntas; preexistente não entra na contagem', () => {
  const value = report(1, '303407e', 'Nenhum achado.\n```md\n' + finding() + '```') + '\n## Preexistente, fora da frente\n### R9-01 · P0 · segurança\n- antigo';
  assert.equal(parseReport(value).findings.length, 0);
});
test('captura avisa HEAD divergente, suporta deletado e não altera árvore/índice', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.pedido, request('0000000', ['estavel.md']));
  fs.unlinkSync(path.join(f.root, 'estavel.md'));
  assert.match(f.reviewer.run(['captura', f.pedido]), /AVISO HEAD mudou/);
  assert.match(fs.readFileSync(path.join(f.dir, 'revisao-r1.patch'), 'utf8'), /deleted file/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(fs.existsSync(path.join(f.root, 'estavel.md')), false);
});
test('nomes com espaços e pathspec literal, binário e snapshot imutável', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'novo [1].txt'), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(f.pedido, request(f.head, ['novo [1].txt']));
  f.reviewer.run(['captura', f.pedido]);
  assert.match(fs.readFileSync(path.join(f.dir, 'revisao-r1.patch'), 'utf8'), /Binary files/);
  fs.writeFileSync(path.join(f.root, 'novo [1].txt'), 'novo');
  assert.deepEqual(fs.readFileSync(path.join(f.dir, 'revisao-snap/r1/arquivos/novo [1].txt')), Buffer.from([0, 1, 2, 3]));
});
test('perguntas com o título antigo são recusadas', () => {
  const old = report(1, '303407e', finding() + '### Perguntas ao Orquestrador\n- Q1: pode?\n');
  assert.throws(() => parseReport(old), /seção desconhecida/);
});
test('CLI acha a raiz pelo Git da pasta atual e recusa gatilho e uso fora do repositório', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'novo.txt'), 'exemplo');
  const sub = path.join(f.root, 'apps/api');
  const run = (cwd, ...args) => cp.spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  const cap = run(sub, 'captura', '.maestri-base/frentes/exemplo/revisao-pedido.md');
  assert.equal(cap.status, 0, cap.stdout); assert.match(cap.stdout, /OK rodada 1/);
  fs.writeFileSync(path.join(f.dir, 'revisao.md'), report(1, f.head));
  const line = run(sub, 'linha', 'exemplo');
  assert.match(line.stdout, /^REVISAO exemplo rodada 1: limpa — .*\.maestri-base[\\/]frentes[\\/]exemplo[\\/]revisao\.md/);
  const old = run(f.root, 'gatilho', '--', 'novo.txt');
  assert.equal(old.status, 1); assert.match(old.stdout, /^RECUSADO uso: captura <pedido> \| linha <frente>/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'revisor-fora-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const fora = run(outside, 'linha', 'exemplo');
  assert.equal(fora.status, 1); assert.match(fora.stdout, /^RECUSADO raiz:/);
});
