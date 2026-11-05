'use strict';

// Testes do papel roadmap: node --test (na pasta scripts/ ou apontando para este arquivo).
// ATUALIZAR_EXEMPLO=1 regrava exemplo/index.html a partir de exemplo/*.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const lib = require('./roadmap-lib.cjs');
const html = require('./gerar-html.cjs');

const SCRIPT = path.join(__dirname, 'roadmap.cjs');
const BASE = path.join(__dirname, '..');
const EXEMPLO = path.join(BASE, 'exemplo');
const AGORA = new Date('2026-11-03T15:00:00Z');

function item(code, title, fields = {}, body = 'Descrição do item.') {
  const f = { Tipo: 'Funcionalidade', Prioridade: 'normal', Tamanho: 'médio', Status: 'parado', Plano: '—', Feito: '—', Criado: '2026-11-01', ...fields };
  const lines = Object.entries(f).map(([k, v]) => `- **${k}:** ${v}`).join('\n');
  return `## ${code} — ${title}\n\n${lines}\n\n${body}\n\n<details><summary>Texto original do dev</summary>\n\n\`\`\`text\n${title.toLowerCase()}\n\`\`\`\n\n</details>\n`;
}

function moduleText(nome, prefixo, ultimo, items) {
  return `# Roadmap — ${nome}\n\n- **Prefixo:** ${prefixo}\n- **Último código usado:** ${ultimo}\n\n${items.join('\n')}`;
}

function plan(code, status) {
  return `# Plano\n\n## 1. Cabeçalho\n\n- **Objetivo:** algo\n- **Status:** ${status}\n  <!-- rascunho → aprovado → em execução → concluído -->\n- **Item do roadmap:** ${code}\n`;
}

function frentes(entries) {
  const body = entries.map(([name, code]) => `### ${name} — Área\n- Orquestrador: Orq Um\n- Item do roadmap: ${code}\n- Status: em andamento\n`).join('\n');
  return `# Frentes ativas\n\n<!-- modelo:\n### modelo — Área\n- Item do roadmap: PED-999\n-->\n\n## Frentes\n\n${body}`;
}

// Projeto falso: .maestri-base/roadmap.json do exemplo, Git com um commit inicial.
function fixture(t, { config, modules = {}, plans = {}, registro, commits = [] } = {}) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-teste-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text, 'utf8');
  };
  const cfgText = config === undefined ? fs.readFileSync(path.join(BASE, 'config.exemplo.json'), 'utf8') : config;
  if (cfgText !== null) write('.maestri-base/roadmap.json', cfgText);
  else fs.mkdirSync(path.join(root, '.maestri-base'), { recursive: true });
  for (const [slug, text] of Object.entries(modules)) write(`docs/roadmap/${slug}.md`, text);
  for (const [dir, text] of Object.entries(plans)) write(`docs/plans/${dir}/plan.md`, text);
  if (registro) write('.maestri-base/frentes-ativas.md', registro);
  const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'core.autocrlf', 'false');
  write('LEIA.md', 'projeto falso\n');
  git('add', 'LEIA.md');
  git('commit', '-qm', 'chore: inicio');
  for (const subject of commits) git('commit', '-q', '--allow-empty', '-m', subject);
  const fakeLog = path.join(root, 'maestri.log');
  // spawnSync: a saída vale também quando o script termina com código 1 (FALHA).
  const run = (args, opts = {}) => cp.spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: opts.cwd || root,
    encoding: 'utf8',
    env: { ...process.env, ROADMAP_ROOT: opts.noRoot ? '' : root, MAESTRI_CLI: path.join(root, 'maestri-falso.cjs'), MAESTRI_LOG: fakeLog, ...(opts.env || {}) },
  }).stdout;
  write('maestri-falso.cjs', `const fs=require('fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.MAESTRI_LOG,a.join(' ')+'\\n');
if(process.env.MAESTRI_QUEBRADO){console.error('canvas fora do ar');process.exit(1);}
if(a[0]==='list'){console.log('You:\\n  - name: "Roadmap Teste"\\n');if(process.env.MAESTRI_PORTAIS)console.log('Connected portals:\\n'+process.env.MAESTRI_PORTAIS.split(',').map(n=>'  - name: "'+n+'"').join('\\n'));}`);
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const last = (text) => text.trim().split(/\r?\n/).pop();
  return { root, git, run, read, write, last, fakeLog };
}

function exemploFixture(t) {
  return fixture(t, {
    modules: {
      pedidos: fs.readFileSync(path.join(EXEMPLO, 'pedidos.md'), 'utf8'),
      catalogo: fs.readFileSync(path.join(EXEMPLO, 'catalogo.md'), 'utf8'),
    },
    plans: {
      '2026-10-22-exportar-pedidos-csv': plan('PED-002', 'em execução'),
      '2026-10-25-busca-sem-acento': plan('CAT-001', 'aprovado'),
    },
    commits: ['fix(pedidos): mostra status enviado no filtro (PED-004)'],
  });
}

// ---------------------------------------------------------------- parser dos .md

test('parser: cabeçalho, campos, descrição, texto original e valores sem acento/caixa', (t) => {
  const f = fixture(t);
  lib.setup(f.root);
  const text = moduleText('Pedidos', 'PED', 'PED-007', [
    item('PED-001', 'Filtro por período', { Tamanho: 'MEDIO', Prioridade: 'Alta', Status: 'feito (manual)' }, 'Primeiro parágrafo.\n\nSegundo parágrafo.'),
  ]);
  const m = lib.parseModuleText(text, path.join(f.root, 'docs/roadmap/pedidos.md'));
  assert.deepEqual(m.errors, []);
  assert.equal(m.nome, 'Pedidos');
  assert.equal(m.prefixo, 'PED');
  assert.equal(m.ultimo, 'PED-007');
  const [it] = m.items;
  assert.equal(it.code, 'PED-001');
  assert.equal(it.tamanho, 'médio');
  assert.equal(it.prioridade, 'alta');
  assert.equal(it.status, 'feito');
  assert.equal(it.manual, true);
  assert.equal(it.plano, '');
  assert.equal(it.description, 'Primeiro parágrafo.\n\nSegundo parágrafo.');
  assert.equal(it.original, 'filtro por período');
});

test('parser: cerca protege "## ", e erros de formato viram mensagens', (t) => {
  const f = fixture(t);
  lib.setup(f.root);
  const file = path.join(f.root, 'docs/roadmap/pedidos.md');
  const cercado = item('PED-001', 'Com cerca', {}, 'Descrição.').replace('```text\ncom cerca', '```text\n## PED-999 — falso\ncom cerca');
  const ok = lib.parseModuleText(moduleText('Pedidos', 'PED', 'PED-001', [cercado]), file);
  assert.deepEqual(ok.items.map((i) => i.code), ['PED-001']);
  assert.deepEqual(ok.errors, []);

  const ruim = lib.parseModuleText(
    `${moduleText('Pedidos', 'PED', 'PED-003', [item('PED-001', 'Sem Tipo', { Tipo: 'Novidade' }), item('PED-002', 'Sem Feito')]).replace('- **Feito:** —\n- **Criado:** 2026-11-01\n\nDescrição do item.\n\n<details><summary>Texto original do dev</summary>\n\n```text\nsem feito', '- **Criado:** 2026-11-01\n\nDescrição do item.\n\n<details><summary>Texto original do dev</summary>\n\n```text\nsem feito')}\n## titulo solto\n\n\`\`\`text\naberta`,
    file,
  );
  const all = ruim.errors.join('\n');
  assert.match(all, /PED-001 Tipo invalido: "Novidade"/);
  assert.match(all, /PED-002 sem o campo "Feito"/);
  assert.match(all, /fora do formato "## COD-000 — Titulo": titulo solto/);
  assert.match(all, /cerca de codigo .* aberta e nunca fechada/);
});

test('parser: código repetido entre arquivos e prefixo vindo da configuração', (t) => {
  const f = fixture(t, {
    modules: {
      pedidos: moduleText('Pedidos', 'PED', 'PED-001', [item('PED-001', 'Um')]),
      outro: `# Roadmap — Outro\n\n${item('PED-001', 'Repetido')}`,
      catalogo: `# Roadmap — Catálogo\n\n${item('CAT-001', 'Prefixo da configuração')}`,
    },
  });
  lib.setup(f.root);
  const r = lib.loadRoadmap();
  assert.ok(r.errors.some((e) => /codigo repetido PED-001/.test(e)));
  assert.ok(r.errors.some((e) => /outro\.md: cabecalho sem "- \*\*Prefixo:\*\* XXX"/.test(e)));
  assert.equal(r.modules.find((m) => m.slug === 'catalogo').prefixo, 'CAT');
});

// ---------------------------------------------------------------- configuração e raiz

test('configuração: padrões sem arquivo, módulos do JSON e erros claros', (t) => {
  const sem = fixture(t, { config: null });
  const c = lib.setup(sem.root);
  assert.equal(c.ROADMAP_REL, 'docs/roadmap');
  assert.equal(c.PORTAL, 'Roadmap');
  assert.equal(c.CONFIG_FILE, null);
  assert.deepEqual(c.MODULES, {});
  assert.equal(path.relative(sem.root, c.FRENTES_FILE).split(path.sep).join('/'), '.maestri-base/frentes-ativas.md');

  const outra = fixture(t, { config: JSON.stringify({ versao: 1, pasta_roadmap: 'planejamento/roadmap/', portal: 'Pendências', modulos: { vitrine: { nome: 'Vitrine', prefixo: 'VIT' } } }) });
  const c2 = lib.setup(outra.root);
  assert.equal(c2.ROADMAP_REL, 'planejamento/roadmap');
  assert.equal(c2.PORTAL, 'Pendências');
  assert.equal(c2.PLANS_DIR, path.join(outra.root, 'docs', 'plans'));
  assert.deepEqual(c2.MODULES, { vitrine: { nome: 'Vitrine', prefixo: 'VIT' } });

  const bad = (config, re) => {
    const x = fixture(t, { config: JSON.stringify(config) });
    assert.throws(() => lib.setup(x.root), re);
  };
  bad({ modulos: { vitrine: { nome: 'Vitrine', prefixo: 'vit' } } }, /2 a 4 letras/);
  bad({ modulos: { a: { nome: 'A', prefixo: 'AAA' }, b: { nome: 'B', prefixo: 'AAA' } } }, /repetido/);
  bad({ modulos: { 'Vitrine Nova': { nome: 'V', prefixo: 'VN' } } }, /minusculo/);
  bad({ pasta_planos: '../fora' }, /relativo/);
  const quebrado = fixture(t, { config: '{ nao e json' });
  assert.match(quebrado.run(['validar']), /^FALHA config: JSON invalido/m);
});

test('raiz: sem ROADMAP_ROOT, sobe da pasta atual até achar .maestri-base/', (t) => {
  const f = fixture(t, { modules: { pedidos: moduleText('Pedidos', 'PED', 'PED-001', [item('PED-001', 'Um')]) } });
  const sub = path.join(f.root, 'apps', 'web');
  fs.mkdirSync(sub, { recursive: true });
  assert.match(f.last(f.run(['validar'], { cwd: sub, noRoot: true })), /^OK formato valido: 1 item\(ns\) em 1 arquivo\(s\)/);
});

// ---------------------------------------------------------------- dedução de Status

test('dedução: precedência frente ativa > plano aberto > concluído/commit', () => {
  const P = (status) => ({ status });
  const commit = { hash: 'abc1234', date: '2026-11-01' };
  assert.equal(lib.deduceStatus([], [], null), 'parado');
  assert.equal(lib.deduceStatus([], [], commit), 'feito');
  assert.equal(lib.deduceStatus([P('concluído')], [], null), 'feito');
  assert.equal(lib.deduceStatus([P('concluído'), P('concluído')], [], null), 'feito');
  assert.equal(lib.deduceStatus([P('aprovado')], [], commit), 'parado');
  assert.equal(lib.deduceStatus([P(null)], [], commit), 'parado');
  assert.equal(lib.deduceStatus([P('concluído'), P('rascunho')], [], null), 'parado');
  assert.equal(lib.deduceStatus([P('em execução')], [], null), 'em execução');
  assert.equal(lib.deduceStatus([P('concluído')], [{ name: 'x' }], commit), 'em execução');
  assert.equal(lib.deduceStatus([], [{ name: 'x' }], commit), 'em execução');
});

test('fontes: plano, registro de frentes e assunto de commit casam o código exato', () => {
  const p = lib.parsePlanText(plan('PED-001, PED-002', 'em execução'));
  assert.deepEqual(p.codes, ['PED-001', 'PED-002']);
  assert.equal(p.status, 'em execução');
  assert.deepEqual(lib.parsePlanText(plan('nenhum', 'Aprovado')).codes, []);
  assert.equal(lib.parsePlanText(plan('PED-001', 'Aprovado')).status, 'aprovado');
  assert.equal(lib.parsePlanText(plan('PED-001', 'pausado')).status, null);

  const fr = lib.parseFrentesText(frentes([['pedidos-filtro', 'PED-001'], ['sem-item', 'nenhum']]));
  assert.deepEqual(fr, [{ name: 'pedidos-filtro — Área', codes: ['PED-001'] }]);

  assert.deepEqual(lib.parseCommitSubject('fix(pedidos): ajusta filtro (PED-004)'), ['PED-004']);
  assert.deepEqual(lib.parseCommitSubject('feat(catalogo): busca (CAT-001, CAT-002)'), ['CAT-001', 'CAT-002']);
  assert.deepEqual(lib.parseCommitSubject('fix(PED-004): escopo nao conta'), []);
  assert.deepEqual(lib.parseCommitSubject('fix: sem parenteses PED-004'), []);
  assert.deepEqual(lib.parseCommitSubject('fix: outro (PED-0040)'), ['PED-0040']);
});

test('status --aplicar: as 3 fontes corrigem o Status e preenchem Feito', (t) => {
  const f = fixture(t, {
    modules: {
      pedidos: moduleText('Pedidos', 'PED', 'PED-005', [
        item('PED-001', 'Plano em execucao'),
        item('PED-002', 'Frente ativa vence commit'),
        item('PED-003', 'Feito por commit'),
        item('PED-004', 'Plano aberto vence commit'),
        item('PED-005', 'Plano concluido'),
      ]),
    },
    plans: {
      'p1': plan('PED-001', 'em execução'),
      'p4': plan('PED-004', 'aprovado'),
      'p5': plan('PED-005', 'concluído'),
    },
    registro: frentes([['frente-dois', 'PED-002']]),
    commits: ['fix(pedidos): um (PED-002)', 'fix(pedidos): tres (PED-003)', 'fix(pedidos): quatro (PED-004)'],
  });
  const dry = f.run(['status']);
  assert.match(dry, /MUDARIA PED-001: Status parado -> em execução/);
  assert.equal(f.read('docs/roadmap/pedidos.md').includes('em execução'), false);

  const out = f.run(['status', '--aplicar']);
  assert.match(out, /MUDOU PED-001: Status parado -> em execução — docs\/plans\/p1\/plan\.md \(em execução\)/);
  assert.match(out, /MUDOU PED-002: Status parado -> em execução — frente "frente-dois — Área" em \.maestri-base\/frentes-ativas\.md/);
  assert.match(out, /MUDOU PED-003: Status parado -> feito — commit [0-9a-f]+ de/);
  assert.match(out, /MUDOU PED-005: Status parado -> feito/);
  assert.doesNotMatch(out, /PED-004/);
  assert.match(f.last(out), /^OK status: 4 mudanca\(s\) aplicada\(s\), 0 divergencia/);
  const items = Object.fromEntries((lib.setup(f.root), lib.loadRoadmap().items).map((i) => [i.code, i]));
  assert.equal(items['PED-001'].status, 'em execução');
  assert.equal(items['PED-002'].status, 'em execução');
  assert.equal(items['PED-003'].status, 'feito');
  assert.match(items['PED-003'].feito, /^\d{4}-\d{2}-\d{2} · commit [0-9a-f]+$/);
  assert.equal(items['PED-004'].status, 'parado');
  assert.match(f.last(f.run(['status'])), /^OK status: nada a corrigir/);
});

test('(manual) nunca é sobrescrito: vira DIVERGE; cancelado sem sinal não diverge', (t) => {
  const text = moduleText('Pedidos', 'PED', 'PED-002', [
    item('PED-001', 'Manual feito', { Status: 'feito (manual)' }),
    item('PED-002', 'Cancelado', { Status: 'cancelado (manual)' }),
  ]);
  const f = fixture(t, { modules: { pedidos: text }, registro: frentes([['frente-um', 'PED-001']]) });
  const out = f.run(['status', '--aplicar']);
  assert.match(out, /DIVERGE PED-001 \(manual\): este Status está "feito", planos\/frentes\/commits dizem "em execução"/);
  assert.doesNotMatch(out, /PED-002/);
  assert.match(f.last(out), /^ALERTA status: 0 mudanca\(s\) aplicada\(s\), 1 divergencia/);
  assert.equal(f.read('docs/roadmap/pedidos.md'), text);

  f.write('.maestri-base/frentes-ativas.md', frentes([['frente-dois', 'PED-002']]));
  assert.match(f.run(['status']), /DIVERGE PED-002 \(manual\): este Status está "cancelado"/);
});

// ---------------------------------------------------------------- código nunca reaproveitado

test('código: conta itens, Último código usado, planos, frentes e commits; reserva grava', (t) => {
  const f = fixture(t, {
    modules: { pedidos: moduleText('Pedidos', 'PED', 'PED-005', [item('PED-001', 'Um'), item('PED-002', 'Dois')]) },
    plans: { p: plan('PED-007', 'rascunho') },
    registro: frentes([['f', 'PED-008']]),
    commits: ['fix: x (PED-009)'],
  });
  assert.match(f.last(f.run(['codigo', 'pedidos'])), /^OK proximo codigo PED-010 .*nada gravado/);
  assert.match(f.read('docs/roadmap/pedidos.md'), /Último código usado:\*\* PED-005/);
  assert.match(f.last(f.run(['codigo', 'pedidos', '--reservar'])), /^OK codigo PED-010 reservado em docs\/roadmap\/pedidos\.md/);
  assert.match(f.read('docs/roadmap/pedidos.md'), /Último código usado:\*\* PED-010/);
  // Item apagado não devolve o número.
  f.write('docs/roadmap/pedidos.md', f.read('docs/roadmap/pedidos.md').replace(/## PED-002[\s\S]*$/, ''));
  assert.match(f.last(f.run(['codigo', 'pedidos'])), /PED-011/);
});

test('código: módulo da configuração cria o arquivo; módulo novo pede prefixo e nome', (t) => {
  const f = fixture(t, { modules: { pedidos: moduleText('Pedidos', 'PED', 'PED-001', [item('PED-001', 'Um')]) } });
  assert.match(f.last(f.run(['codigo', 'catalogo', '--reservar'])), /^OK codigo CAT-001 reservado; criei docs\/roadmap\/catalogo\.md/);
  assert.match(f.read('docs/roadmap/catalogo.md'), /^# Roadmap — Catálogo\n\n- \*\*Prefixo:\*\* CAT\n- \*\*Último código usado:\*\* CAT-001\n/);
  assert.match(f.last(f.run(['codigo', 'vitrine'])), /^FALHA modulo "vitrine" desconhecido.*pedidos, catalogo, plataforma/);
  assert.match(f.last(f.run(['codigo', 'vitrine', '--prefixo', 'PED', '--nome', 'Vitrine'])), /^FALHA prefixo PED ja e do modulo pedidos/);
  assert.match(f.last(f.run(['codigo', 'vitrine', '--prefixo', 'PLT', '--nome', 'Vitrine'])), /^FALHA prefixo PLT ja e do modulo plataforma/);
  assert.match(f.last(f.run(['codigo', 'Vitrine', '--reservar', '--prefixo', 'vit', '--nome', 'Vitrine'])), /^OK codigo VIT-001 reservado; criei docs\/roadmap\/vitrine\.md/);
  assert.match(f.last(f.run(['modulos'])), /^OK 3 modulo\(s\) com arquivo, 1 da configuracao sem arquivo \(\.maestri-base\/roadmap\.json\)/);
});

// ---------------------------------------------------------------- HTML

test('HTML determinístico: mesma entrada e mesma hora dão os mesmos bytes', (t) => {
  const f = exemploFixture(t);
  lib.setup(f.root);
  const a = html.build(AGORA).html;
  const b = html.build(new Date(AGORA)).html;
  assert.equal(a, b);
  assert.match(a, /gerado em 03\/11\/2026, 12:00 a partir de docs\/roadmap\/\*\.md/);
  assert.doesNotMatch(a, /<script/i);
  assert.match(a, /Urgentes sem plano: <b>PED-003<\/b>/);
  // A ordem no grupo: prioridade, tamanho, código.
  const parado = a.slice(a.indexOf('group-parado'), a.indexOf('group-em-execucao'));
  const order = [...parado.matchAll(/class="code">([A-Z]+-\d+)/g)].map((m) => m[1]);
  assert.deepEqual(order, ['PED-003', 'PED-001', 'CAT-001', 'CAT-004']);
  assert.match(a, /CAT-001<\/span>[\s\S]*?plano-com-plano/);
});

test('exemplo/index.html está em dia com exemplo/*.md', (t) => {
  const f = exemploFixture(t);
  lib.setup(f.root);
  const page = html.build(AGORA).html;
  const file = path.join(EXEMPLO, 'index.html');
  if (process.env.ATUALIZAR_EXEMPLO) fs.writeFileSync(file, page, 'utf8');
  assert.equal(fs.readFileSync(file, 'utf8'), page);
});

test('exemplo é coerente com a dedução: só o relato de agente aparece como DIVERGE', (t) => {
  const f = exemploFixture(t);
  const out = f.run(['status']);
  assert.deepEqual(out.split(/\r?\n/).filter((l) => /^(MUDARIA|DIVERGE|AVISO)/.test(l)).map((l) => l.split(':')[0]), ['DIVERGE CAT-003 (manual)']);
  assert.match(f.last(f.run(['validar'])), /^OK formato valido: 8 item\(ns\) em 2 arquivo\(s\)/);
});

test('html e portal: cria na primeira vez, depois só navega; sem canvas vira ALERTA', (t) => {
  const f = exemploFixture(t);
  const first = f.run(['atualizar']);
  assert.match(first, /^PORTAL portal "Roadmap" aberto \(file:\/\/\/.*docs\/roadmap\/index\.html\)/m);
  assert.match(f.last(first), /^ALERTA roadmap: 8 item\(ns\) \(parado=4 em execucao=2 feito=1 cancelado=1\); urgentes sem plano=1 \(PED-003\);.*1 divergencia/);
  assert.match(fs.readFileSync(f.fakeLog, 'utf8'), /^portal create file:\/\/\/\S+index\.html Roadmap$/m);
  const again = f.run(['html'], { env: { MAESTRI_PORTAIS: 'Outro,Roadmap' } });
  assert.match(again, /^PORTAL portal "Roadmap" recarregado/m);
  assert.match(fs.readFileSync(f.fakeLog, 'utf8'), /^portal navigate Roadmap file:\/\/\//m);
  assert.match(f.run(['html']), /^PORTAL portal "Roadmap" nao esta aberto; nada a recarregar/m);
  assert.match(f.run(['portal'], { env: { MAESTRI_QUEBRADO: '1' } }), /^ALERTA portal nao aberto \(canvas fora do ar\)/m);
});

// ---------------------------------------------------------------- mudanças e commit

test('commit: só os .md do roadmap, mensagem com o prefixo, nada de fora do índice', (t) => {
  const f = fixture(t, { modules: { pedidos: moduleText('Pedidos', 'PED', 'PED-001', [item('PED-001', 'Um')]) } });
  f.git('add', 'docs/roadmap/pedidos.md');
  f.git('commit', '-qm', 'docs(roadmap): +PED-001');
  f.write('docs/roadmap/pedidos.md', f.read('docs/roadmap/pedidos.md').replace('- **Prioridade:** normal', '- **Prioridade:** urgente') + '\n' + item('PED-002', 'Dois'));
  f.write('outro.txt', 'alheio\n');
  f.git('add', 'outro.txt');
  const m = f.run(['mudancas']);
  assert.match(m, /^~ PED-001 Um: prioridade: normal → urgente/m);
  assert.match(m, /^\+ PED-002 Dois/m);
  assert.match(m, /^MENSAGEM docs\(roadmap\): PED-001 prioridade → urgente, \+PED-002$/m);
  assert.match(f.last(f.run(['commit', '--mensagem', 'chore: errado'])), /^RECUSADO a mensagem precisa comecar com "docs\(roadmap\): "/);
  assert.match(f.last(f.run(['commit'])), /^OK commit [0-9a-f]+ na \S+: docs\(roadmap\): PED-001 prioridade → urgente, \+PED-002 \(sem push\)$/);
  assert.equal(f.git('show', '--name-only', '--format=', 'HEAD'), 'docs/roadmap/pedidos.md');
  assert.equal(f.git('diff', '--cached', '--name-only'), 'outro.txt');
  assert.match(f.last(f.run(['mudancas'])), /^OK nada a commitar em docs\/roadmap\/\*\.md/);
});

test('commit: erro de formato bloqueia; prefixo vem da configuração', (t) => {
  const f = fixture(t, {
    config: JSON.stringify({ versao: 1, prefixo_commit: 'chore(pendencias): ' }),
    modules: { pedidos: moduleText('Pedidos', 'PED', 'PED-001', [item('PED-001', 'Um', { Tamanho: 'enorme' })]) },
  });
  assert.match(f.last(f.run(['commit'])), /^FALHA 1 erro\(s\) de formato/);
  f.write('docs/roadmap/pedidos.md', f.read('docs/roadmap/pedidos.md').replace('enorme', 'grande'));
  assert.match(f.last(f.run(['commit'])), /^OK commit [0-9a-f]+ na \S+: chore\(pendencias\): \+PED-001 \(sem push\)$/);
});

// ---------------------------------------------------------------- contrato com as outras bases

// Formato compartilhado só está certo quando o exemplo de um lado passa no parser do outro. Na base, os
// modelos do planner e do Orquestrador estão nas pastas vizinhas; instalado num projeto, o teste pula.
const PLAN_MODELO = path.join(BASE, '..', 'planner', 'references', 'plan-modelo.md');
const FRENTES_MODELO = path.join(BASE, '..', 'orquestrador', 'references', 'frentes-ativas-modelo.md');

test('contrato: plan-modelo.md do planner, preenchido, passa no parser de planos', { skip: !fs.existsSync(PLAN_MODELO) }, () => {
  const modelo = fs.readFileSync(PLAN_MODELO, 'utf8');
  const p = lib.parsePlanText(modelo.replace('<código> | nenhum', 'PED-004'));
  assert.deepEqual(p.codes, ['PED-004']);
  assert.equal(p.status, 'rascunho');
  assert.equal(lib.parsePlanText(modelo.replace('<código> | nenhum', 'nenhum').replace('**Status:** rascunho', '**Status:** em execução')).status, 'em execução');
});

test('contrato: entrada do frentes-ativas-modelo.md do Orquestrador passa no parser de frentes', { skip: !fs.existsSync(FRENTES_MODELO) }, () => {
  const modelo = fs.readFileSync(FRENTES_MODELO, 'utf8');
  assert.deepEqual(lib.parseFrentesText(modelo), []);
  const entrada = modelo.match(/### <frente>[\s\S]*?(?=-->)/)[0]
    .replace('<frente> — <Área>', 'pedidos-filtro — Pedidos')
    .replace('<código> | nenhum', 'PED-004');
  assert.deepEqual(lib.parseFrentesText(`${modelo}\n${entrada}`), [{ name: 'pedidos-filtro — Pedidos', codes: ['PED-004'] }]);
});
