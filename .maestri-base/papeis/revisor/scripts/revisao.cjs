#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

// Revisor do método Maestri: captura o diff de uma frente (Git só de leitura) e valida o relatório.
// Raiz = topo do repositório Git da pasta atual (rode com cd na raiz do projeto).
// Estado da frente em .maestri-base/frentes/<frente>/ (padrão do molde).
const FRENTES = '.maestri-base/frentes';
// Caminhos que nunca entram numa captura: Git, variáveis de ambiente e pasta de credenciais.
const PROTEGIDOS = /^(?:\.git|\.credenciais|\.env(?:\..*)?)$/i;
const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const refuse = (s) => { throw new Error(`RECUSADO ${s}`); };
const slash = (s) => s.split(path.sep).join('/');

function safePath(value) {
  const name = value.trim().replace(/\\/g, '/');
  if (!name || path.isAbsolute(name) || /^[a-z]:/i.test(name) || name.split('/').some((s) => !s || s === '.' || s === '..') || /[\x00-\x1f]/.test(name)) refuse('pedido: caminho deve ser arquivo relativo à raiz');
  if (name.split('/').some((s) => PROTEGIDOS.test(s))) refuse('pedido: caminho protegido');
  return name;
}

function parsePedido(text) {
  const fields = {};
  const sections = {};
  let section = '';
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) { section = fold(heading[1]); sections[section] ||= []; continue; }
    if (section) { sections[section].push(line); continue; }
    const field = line.match(/^([^:]+):\s*(.*)$/);
    if (!field || fields[fold(field[1])] !== undefined) refuse('pedido: cabeçalho inválido ou duplicado');
    fields[fold(field[1])] = field[2];
  }
  for (const name of ['frente', 'solicitante', 'origem', 'plano', 'head']) if (!fields[name]) refuse(`pedido: falta ${name}`);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(fields.frente)) refuse('pedido: frente inválida');
  if (!['plano', 'pedido'].includes(fold(fields.origem))) refuse('pedido: origem deve ser plano ou pedido');
  if (!/^[a-f0-9]{7,40}$/i.test(fields.head)) refuse('pedido: HEAD inválido');
  if (fold(fields.origem) === 'plano' && /^[—–-]$/.test(fields.plano)) refuse('pedido: origem plano exige Plano');
  if (!/^[—–-]$/.test(fields.plano)) fields.plano = safePath(fields.plano);
  if (fold(fields.origem) === 'pedido' && !sections.pedido?.join('').trim()) refuse('pedido: falta seção Pedido');
  if (!Object.hasOwn(sections, 'decisoes do dev')) refuse('pedido: falta seção Decisões do dev (use nenhuma quando não houver)');
  const files = (sections.arquivos || []).map((line) => {
    if (!/^-\s+/.test(line)) refuse('pedido: Arquivos deve ser lista de caminhos');
    return safePath(line.replace(/^-\s+/, ''));
  });
  if (!files.length) refuse('pedido: falta lista de arquivos');
  if (new Set(files.map((f) => f.toLowerCase())).size !== files.length) refuse('pedido: arquivo duplicado');
  return { fields, sections, files, front: fields.frente };
}

function parseReport(text) {
  // Cercas de código não podem criar rodadas, campos, perguntas ou achados falsos.
  const lines = text.split(/\r?\n/);
  const visible = [];
  let fence = null;
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) { if (!fence) fence = m[1][0]; else if (fence === m[1][0]) fence = null; visible.push(''); }
    else visible.push(fence ? '' : line);
  }
  const rounds = [];
  let preexisting = false;
  let current = null;
  for (const line of visible) {
    if (/^##\s+Preexistente, fora da frente\s*$/i.test(line)) {
      if (preexisting) refuse('relatório: seção Preexistente duplicada');
      preexisting = true; current = null; continue;
    }
    const h = line.match(/^##\s+Rodada\s+(\d+)\s+—\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+—\s+HEAD\s+([a-f0-9]{7,40})\s*$/i);
    if (h) {
      if (preexisting) refuse('relatório: Preexistente deve ficar no fim');
      const n = Number(h[1]);
      if (n !== rounds.length + 1) refuse('relatório: rodadas devem ser consecutivas desde 1');
      current = { n, head: h[3], lines: [] }; rounds.push(current); continue;
    }
    if (/^##\s/.test(line)) refuse('relatório: cabeçalho de rodada inválido');
    if (current) current.lines.push(line);
  }
  if (!rounds.length) refuse('relatório: nenhuma rodada');
  const latest = rounds.at(-1);
  const findings = [];
  const questions = new Set();
  const reconciled = new Set();
  let finding = null;
  let section = '';
  let clean = false;
  for (const line of latest.lines) {
    if (line.trim() === 'Nenhum achado.') { clean = true; continue; }
    const h = line.match(/^###\s+(R\d+-\d+)\s+·\s+(\S+)\s+·\s+(.+?)\s*$/);
    if (h) {
      if (!h[1].startsWith(`R${latest.n}-`)) refuse(`relatório: ${h[1]} pertence a outra rodada`);
      if (!/^P[0-3]$/.test(h[2])) refuse(`relatório: ${h[1]} com severidade inválida`);
      if (!['codigo', 'seguranca', 'documentacao', 'sobra'].includes(fold(h[3]))) refuse(`relatório: ${h[1]} com bloco inválido`);
      if (findings.some((f) => f.id === h[1])) refuse(`relatório: ${h[1]} duplicado`);
      finding = { id: h[1], severity: h[2], fields: {} }; findings.push(finding); section = 'finding'; continue;
    }
    if (/^###\s+/.test(line)) {
      section = fold(line.replace(/^###\s+/, ''));
      if (!['perguntas ao solicitante', 'conferencia da rodada anterior'].includes(section)) refuse('relatório: seção desconhecida');
      finding = null; continue;
    }
    if (section === 'finding') {
      const field = line.match(/^-\s+([^:]+):\s*(.*)$/);
      if (field) {
        const key = fold(field[1]);
        if (Object.hasOwn(finding.fields, key)) refuse(`relatório: ${finding.id} campo duplicado`);
        finding.fields[key] = field[2];
      }
    } else if (section === 'perguntas ao solicitante' && line.trim()) {
      const q = line.match(/^-\s+(Q\d+):\s*(.+)$/);
      if (!q || questions.has(q[1])) refuse('relatório: pergunta inválida ou duplicada');
      questions.add(q[1]);
    } else if (section === 'conferencia da rodada anterior' && line.trim()) {
      const c = line.match(/^-\s+(R\d+-\d+):\s*(corrigido com problema\s*→\s*(R\d+-\d+)|não corrigido|nao corrigido|corrigido)\s*$/);
      if (!c || reconciled.has(c[1])) refuse('relatório: conferência anterior inválida');
      reconciled.add(c[1]);
    }
  }
  if (clean && findings.length) refuse('relatório: Nenhum achado contradiz achados');
  if (!clean && !findings.length) refuse('relatório: escreva Nenhum achado. ou os achados');
  for (const f of findings) {
    if (!f.fields.onde || !/^.+:\d+$/.test(f.fields.onde)) refuse(`relatório: ${f.id} sem Onde arquivo:linha`);
    if (!f.fields.cenario || /^[—–-]$|^\([^)]*\)$|^(?:TBD|a definir)$/i.test(f.fields.cenario)) refuse(`relatório: ${f.id} sem cenário`);
    if (f.fields.condicional && !questions.has(f.fields.condicional)) refuse(`relatório: ${f.id} sem pergunta ${f.fields.condicional}`);
  }
  if (latest.n > 1) {
    if (!latest.lines.some((l) => fold(l.replace(/^###\s+/, '')) === 'conferencia da rodada anterior')) refuse('relatório: falta Conferência da rodada anterior');
    const ids = rounds.at(-2).lines.map((l) => l.match(/^###\s+(R\d+-\d+)\s+·/)).filter(Boolean).map((m) => m[1]);
    for (const id of ids) if (!reconciled.has(id)) refuse(`relatório: falta conferência de ${id}`);
    for (const id of reconciled) if (!ids.includes(id)) refuse(`relatório: conferência de achado desconhecido ${id}`);
    for (const line of latest.lines) {
      const link = line.match(/corrigido com problema\s*→\s*(R\d+-\d+)/);
      if (link && !findings.some((f) => f.id === link[1])) refuse(`relatório: referência desconhecida ${link[1]}`);
    }
  }
  return { ...latest, findings, questions: questions.size };
}

function gitRoot(cwd = process.cwd()) {
  let top;
  try {
    top = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { return refuse('raiz: rode o comando dentro do repositório do projeto (cd na raiz)'); }
  return fs.realpathSync.native(top);
}

function createReviewer(root = gitRoot()) {
  root = fs.realpathSync.native(root);
  function git(args, allowed = [0]) {
    const opts = {
      cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 60000,
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_EXTERNAL_DIFF: '', GIT_PAGER: 'cat' },
    };
    try { return cp.execFileSync('git', ['--no-optional-locks', '--literal-pathspecs', ...args], opts); }
    catch (error) {
      if (allowed.includes(error.status) && typeof error.stdout === 'string') return error.stdout;
      throw new Error(`FALHA git ${args[0]}: não foi possível concluir a leitura`);
    }
  }
  function checkedFile(file) {
    const rel = safePath(file);
    const absolute = path.resolve(root, rel);
    let cur = root;
    for (const part of rel.split('/')) {
      cur = path.join(cur, part);
      if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) refuse('pedido: caminho com link simbólico');
    }
    if (fs.existsSync(absolute) && !fs.statSync(absolute).isFile()) refuse(`pedido: não é arquivo ${rel}`);
    return absolute;
  }
  function frontDir(front) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(front)) refuse('frente inválida');
    const dir = path.join(root, FRENTES, front);
    // Não atravessa junction/symlink de uma pasta de saída.
    checkedFile(slash(path.relative(root, path.join(dir, 'revisao-pedido.md'))));
    if (!fs.existsSync(dir)) refuse('pedido: pasta da frente ausente');
    return dir;
  }
  function pedido(value) {
    let resolved = path.resolve(root, value);
    // Windows pode entregar o mesmo temp por alias 8.3 (USURIO~2) ou nome longo.
    if (fs.existsSync(resolved)) resolved = fs.realpathSync.native(resolved);
    const abs = checkedFile(slash(path.relative(root, resolved)));
    if (!fs.existsSync(abs)) refuse('pedido: arquivo ausente');
    const text = fs.readFileSync(abs, 'utf8');
    const p = parsePedido(text);
    const dir = frontDir(p.front);
    if (abs !== path.join(dir, 'revisao-pedido.md')) refuse(`pedido: use ${FRENTES}/<frente>/revisao-pedido.md`);
    for (const file of p.files) checkedFile(file);
    if (fold(p.fields.origem) === 'plano' && !fs.existsSync(checkedFile(p.fields.plano))) refuse('pedido: plano não encontrado');
    return { ...p, dir, abs, text };
  }
  const diff = (files) => git(['diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--', ...files]);
  function newFiles(files) {
    return git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...files]).split('\0').filter(Boolean);
  }
  function addedPatch(file, buf) {
    if (buf.includes(0)) return `diff --git a/${file} b/${file}\nnew file mode 100644\nBinary files /dev/null and b/${file} differ\n`;
    const text = buf.toString('utf8');
    const lines = text ? text.replace(/\n$/, '').split('\n') : [];
    return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map((l) => '+' + l).join('\n') + (lines.length ? '\n' : '') + (text && !text.endsWith('\n') ? '\\ No newline at end of file\n' : '');
  }
  function capture(p) {
    const lock = path.join(p.dir, '.revisao-captura.lock');
    let fd;
    try { fd = fs.openSync(lock, 'wx'); } catch { return refuse('captura: outra chamada está em andamento'); }
    const generated = [];
    try {
      const existing = fs.readdirSync(p.dir).map((n) => n.match(/^revisao-r(\d+)\.patch$/)).filter(Boolean).map((m) => Number(m[1]));
      const round = Math.max(0, ...existing) + 1;
      const head = git(['rev-parse', 'HEAD']).trim();
      const beforeIndex = git(['ls-files', '--stage', '-z', '--', ...p.files]);
      const warnings = [];
      if (!head.startsWith(p.fields.head.toLowerCase())) warnings.push(`HEAD mudou: pedido ${p.fields.head}, captura ${head}`);
      const snapshot = path.join(p.dir, 'revisao-snap', `r${round}`);
      if (fs.existsSync(snapshot)) refuse('captura: snapshot incompleto existente; informe ao solicitante');
      checkedFile(slash(path.relative(root, path.join(snapshot, 'manifest.json'))));
      const contentDir = path.join(snapshot, 'arquivos');
      fs.mkdirSync(contentDir, { recursive: true }); generated.push(snapshot);
      const contents = new Map();
      const manifest = { round, head, pedidoHash: sha(p.text), files: {}, limitation: 'Lista de arquivos delimita área, não autoria; inclui alterações de outras sessões nos mesmos caminhos.' };
      for (const file of p.files) {
        const absolute = checkedFile(file);
        if (!fs.existsSync(absolute)) {
          warnings.push(`arquivo não existe: ${file}`); manifest.files[file] = null; contents.set(file, null); continue;
        }
        const buf = fs.readFileSync(absolute);
        contents.set(file, buf);
        manifest.files[file] = { sha256: sha(buf), bytes: buf.length, mtime: fs.statSync(absolute).mtimeMs };
        const dest = path.join(contentDir, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
      }
      let patch = diff(p.files);
      const tracked = new Set(git(['ls-files', '-z', '--', ...p.files]).split('\0').filter(Boolean));
      const untracked = new Set(newFiles(p.files));
      for (const file of p.files) {
        if (untracked.has(file) && contents.get(file)) patch += addedPatch(file, contents.get(file));
        else if (!tracked.has(file) && contents.get(file)) warnings.push(`arquivo ignorado/não rastreado fora de ls-files --others: ${file}; conteúdo só no snapshot`);
        if (tracked.has(file) && !diff([file])) warnings.push(`arquivo sem mudança contra HEAD: ${file}`);
      }
      let delta;
      if (round > 1) {
        const prior = path.join(p.dir, 'revisao-snap', `r${round - 1}`, 'arquivos');
        if (!fs.existsSync(prior)) refuse('captura: snapshot da rodada anterior ausente');
        delta = git(['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--binary', '--', prior, contentDir], [0, 1]);
      }
      if (git(['rev-parse', 'HEAD']).trim() !== head || git(['ls-files', '--stage', '-z', '--', ...p.files]) !== beforeIndex || fs.readFileSync(p.abs, 'utf8') !== p.text) refuse('captura: HEAD, índice ou pedido mudou durante a leitura; repita quando estiver estável');
      for (const [file, buf] of contents) {
        const abs = checkedFile(file);
        if (buf === null ? fs.existsSync(abs) : !fs.existsSync(abs) || !fs.readFileSync(abs).equals(buf)) refuse(`captura: arquivo mudou durante a leitura: ${file}`);
      }
      const patchFile = path.join(p.dir, `revisao-r${round}.patch`);
      fs.writeFileSync(path.join(snapshot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      if (round > 1) {
        const file = path.join(p.dir, `revisao-delta-r${round}.patch`);
        fs.writeFileSync(file, delta, { flag: 'wx' }); generated.push(file);
      }
      fs.writeFileSync(patchFile, patch, { flag: 'wx' }); generated.push(patchFile);
      const added = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
      const removed = patch.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
      return [...warnings.map((s) => 'AVISO ' + s), 'AVISO ' + manifest.limitation,
        `OK rodada ${round}: ${p.files.length} arquivos, +${added} -${removed} linhas, patch em ${patchFile}${round > 1 ? `, delta em ${path.join(p.dir, `revisao-delta-r${round}.patch`)}` : ''}`].join('\n');
    } catch (e) {
      // Só desfaz artefatos desta tentativa; nunca toca nos arquivos revisados ou em rodada anterior.
      for (const file of generated.reverse()) {
        const relative = path.relative(p.dir, file);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(file, { recursive: true, force: true });
      }
      throw e;
    } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  function run(args) {
    const [command, ...rest] = args;
    if (command === 'captura') {
      if (rest.length !== 1) refuse('uso: captura <pedido>');
      return capture(pedido(rest[0]));
    }
    if (command === 'linha') {
      if (rest.length !== 1) refuse('uso: linha <frente>');
      const dir = frontDir(rest[0]);
      const file = path.join(dir, 'revisao.md');
      checkedFile(slash(path.relative(root, file)));
      if (!fs.existsSync(file)) refuse('relatório: revisao.md ausente');
      const report = parseReport(fs.readFileSync(file, 'utf8'));
      const captures = fs.readdirSync(dir).map((n) => n.match(/^revisao-r(\d+)\.patch$/)).filter(Boolean).map((m) => Number(m[1]));
      if (report.n !== Math.max(0, ...captures)) refuse('relatório: última rodada não corresponde à captura');
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'revisao-snap', `r${report.n}`, 'manifest.json'), 'utf8'));
      if (!manifest.head.startsWith(report.head.toLowerCase())) refuse('relatório: HEAD não corresponde à captura');
      const counts = ['P0', 'P1', 'P2', 'P3'].map((s) => `${report.findings.filter((f) => f.severity === s).length} ${s}`).join(', ');
      return `REVISAO ${rest[0]} rodada ${report.n}: ${report.findings.length ? counts : 'limpa'}${report.questions ? `, ${report.questions} perguntas` : ''} — ${file}`;
    }
    refuse('uso: captura <pedido> | linha <frente>');
  }
  return { run, git };
}

module.exports = { parsePedido, parseReport, createReviewer, gitRoot };
if (require.main === module) {
  try { process.stdout.write(createReviewer().run(process.argv.slice(2)) + '\n'); }
  catch (e) { process.stdout.write((/^(RECUSADO|FALHA) /.test(e.message) ? e.message : 'FALHA revisão: não foi possível ler pedido, relatório ou arquivos da captura') + '\n'); process.exitCode = 1; }
}
