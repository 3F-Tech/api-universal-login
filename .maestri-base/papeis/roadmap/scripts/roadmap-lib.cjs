'use strict';

// Leitura do roadmap (<pasta do roadmap>/*.md) e dos planos (<pasta de planos>/*/plan.md). Só lê: quem
// escreve é o roadmap.cjs (linhas pontuais) e o agente (Edit). O formato está em references/formato.md.
//
// Raiz do projeto: ROADMAP_ROOT, se definida; senão a primeira pasta com .maestri-base/ subindo da pasta
// atual e, depois, da pasta deste script (funciona em qualquer profundidade de instalação).
// Configuração: .maestri-base/roadmap.json (exemplo em config.exemplo.json). Sem ela valem os padrões.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONFIG = '.maestri-base/roadmap.json';
const PADRAO = {
  pasta_roadmap: 'docs/roadmap',
  pasta_planos: 'docs/plans',
  registro_frentes: '.maestri-base/frentes-ativas.md',
  portal: 'Roadmap',
  prefixo_commit: 'docs(roadmap): ',
  fuso_horario: 'America/Sao_Paulo',
};

// Valores possíveis, na ordem de exibição. Iguais em todo projeto, para todo roadmap ter a mesma cara.
const FIELDS = {
  Tipo: ['Funcionalidade', 'Melhoria técnica', 'Suporte/correção', 'Dependência externa', 'Verificação'],
  Prioridade: ['mínima', 'normal', 'alta', 'urgente'],
  Tamanho: ['pequeno', 'médio', 'grande', 'muito grande'],
  Status: ['parado', 'em execução', 'feito', 'cancelado'],
};
const DEFAULTS = { Prioridade: 'normal', Tamanho: 'médio', Status: 'parado' };
const REQUIRED = ['Tipo', 'Prioridade', 'Tamanho', 'Status', 'Plano', 'Feito', 'Criado'];
const MANUAL_MARK = '(manual)';
const PLAN_STATUSES = ['rascunho', 'aprovado', 'em execução', 'concluído'];

const CODE_RE = /\b([A-Z]{2,4})-(\d{3,})\b/g;

// Comparação sem acento e sem caixa: "Médio", "medio" e "MÉDIO" são o mesmo valor.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function canonical(field, value) {
  const f = fold(value);
  return (FIELDS[field] || []).find((v) => fold(v) === f) || null;
}

function stripMarkup(s) {
  return String(s || '').replace(/\*\*/g, '').replace(/`/g, '').trim();
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

// ---------------------------------------------------------------- raiz e configuração

function findRoot() {
  if (process.env.ROADMAP_ROOT) return path.resolve(process.env.ROADMAP_ROOT);
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (;;) {
      const mark = path.join(dir, '.maestri-base');
      if (fs.existsSync(mark) && fs.statSync(mark).isDirectory()) return dir;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  throw new Error('raiz do projeto nao encontrada: rode com cd na raiz (a pasta que tem .maestri-base/) ou defina ROADMAP_ROOT');
}

function relPath(value, field) {
  const v = String(value).trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!v || path.isAbsolute(v) || /^[a-z]:/i.test(v) || v.split('/').includes('..')) {
    throw new Error(`config: "${field}" deve ser caminho relativo a raiz (${CONFIG})`);
  }
  return v;
}

// Módulos conhecidos: slug do arquivo → nome e prefixo do código. Vêm da configuração do projeto. Módulo
// novo também entra pelo cabeçalho do próprio arquivo (o script lê o prefixo de lá).
function readConfig(root) {
  const file = path.join(root, CONFIG);
  let raw = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(readText(file));
    } catch {
      throw new Error(`config: JSON invalido (${CONFIG})`);
    }
  }
  const c = { ...PADRAO, ...raw };
  for (const k of ['pasta_roadmap', 'pasta_planos', 'registro_frentes']) c[k] = relPath(c[k], k);
  const modules = {};
  const prefixes = new Set();
  for (const [slug, m] of Object.entries(raw.modulos || {})) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`config: modulo "${slug}" deve ser minusculo, sem acento nem espaco (${CONFIG})`);
    const prefixo = String((m && m.prefixo) || '').trim();
    if (!m || !String(m.nome || '').trim() || !/^[A-Z]{2,4}$/.test(prefixo)) {
      throw new Error(`config: modulo "${slug}" precisa de "nome" e "prefixo" de 2 a 4 letras maiusculas (${CONFIG})`);
    }
    if (prefixes.has(prefixo)) throw new Error(`config: prefixo ${prefixo} repetido (${CONFIG})`);
    prefixes.add(prefixo);
    modules[slug] = { nome: String(m.nome).trim(), prefixo };
  }
  return { ...c, modules, file: fs.existsSync(file) ? CONFIG : null };
}

let current = null;

// Fixa a raiz (teste passa a pasta; uso normal deduz) e relê a configuração.
function setup(root = findRoot()) {
  const ROOT = fs.realpathSync.native(path.resolve(root));
  const c = readConfig(ROOT);
  const ROADMAP_DIR = path.join(ROOT, c.pasta_roadmap);
  current = {
    ROOT,
    ROADMAP_DIR,
    ROADMAP_REL: c.pasta_roadmap,
    PLANS_DIR: path.join(ROOT, c.pasta_planos),
    HTML_FILE: path.join(ROADMAP_DIR, 'index.html'),
    FRENTES_FILE: path.join(ROOT, c.registro_frentes),
    MODULES: c.modules,
    PORTAL: String(c.portal),
    COMMIT_PREFIX: String(c.prefixo_commit),
    TZ: String(c.fuso_horario),
    CONFIG_FILE: c.file,
  };
  return current;
}

function cfg() {
  return current || setup();
}

function rel(file) {
  return path.relative(cfg().ROOT, file).split(path.sep).join('/');
}

// ---------------------------------------------------------------- roadmap

function moduleFiles() {
  const { ROADMAP_DIR } = cfg();
  if (!fs.existsSync(ROADMAP_DIR)) return [];
  return fs.readdirSync(ROADMAP_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => path.join(ROADMAP_DIR, f));
}

// Um arquivo de módulo: cabeçalho (# Roadmap — Nome, Prefixo, Último código usado) e itens
// (## CÓDIGO — Título). Linhas dentro de cerca (``` ou ~~~) nunca abrem item: o texto original do
// dev vai cercado, e pode ter "## " dentro.
function parseModuleText(text, file) {
  const lines = text.split(/\r?\n/);
  const mod = {
    file,
    slug: path.basename(file, '.md'),
    nome: null,
    prefixo: null,
    ultimo: null,
    items: [],
    errors: [],
  };
  let fence = null;
  let cur = null;
  const flush = () => {
    if (cur) mod.items.push(finishItem(cur, mod));
    cur = null;
  };
  lines.forEach((line, i) => {
    const n = i + 1;
    const fm = line.match(/^\s*(```+|~~~+)/);
    if (fm) {
      if (!fence) fence = fm[1][0];
      else if (fm[1][0] === fence) fence = null;
      if (cur) cur.body.push(line);
      return;
    }
    if (fence) {
      if (cur) cur.body.push(line);
      return;
    }
    const h1 = line.match(/^#\s+Roadmap\s*[—–-]\s*(.+?)\s*$/);
    if (h1 && !cur) {
      mod.nome = h1[1];
      return;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      flush();
      const m = h2[1].match(/^([A-Z]{2,4}-\d{3,})\s*[—–-]\s*(.+?)\s*$/);
      if (!m) {
        mod.errors.push(`${path.basename(file)}:${n} titulo de item fora do formato "## COD-000 — Titulo": ${h2[1]}`);
        cur = null;
        return;
      }
      cur = { code: m[1], title: m[2], line: n, fields: {}, fieldLines: {}, body: [] };
      return;
    }
    const fl = line.match(/^-\s+\*\*([^*]+?):\*\*\s*(.*)$/);
    if (fl && !cur) {
      const k = fold(fl[1]);
      if (k === 'prefixo') mod.prefixo = stripMarkup(fl[2]);
      if (k === 'ultimo codigo usado') mod.ultimo = stripMarkup(fl[2]);
      return;
    }
    if (fl && cur && cur.body.every((b) => !b.trim())) {
      cur.fields[fl[1].trim()] = stripMarkup(fl[2]);
      cur.fieldLines[fl[1].trim()] = n;
      cur.body = [];
      return;
    }
    if (cur) cur.body.push(line);
  });
  flush();
  if (fence) mod.errors.push(`${path.basename(file)}: cerca de codigo (\`\`\` ou ~~~) aberta e nunca fechada`);
  const known = cfg().MODULES[mod.slug];
  if (!mod.nome) mod.nome = known ? known.nome : mod.slug;
  if (!mod.prefixo) {
    if (known) mod.prefixo = known.prefixo;
    else mod.errors.push(`${path.basename(file)}: cabecalho sem "- **Prefixo:** XXX"`);
  }
  // Item movido de módulo mantém o código (o prefixo antigo é aceito de propósito).
  return mod;
}

function finishItem(cur, mod) {
  const body = cur.body.join('\n');
  // Texto original do dev: o bloco <details> inteiro, sem o <summary> e sem a cerca.
  let original = '';
  let description = body;
  const d = body.match(/<details>[\s\S]*?<\/details>/);
  if (d) {
    description = body.replace(d[0], '');
    original = d[0]
      .replace(/<\/?details>/g, '')
      .replace(/<summary>[\s\S]*?<\/summary>/, '')
      .replace(/^\s*(```+|~~~+)[^\n]*\n?/m, '')
      .replace(/\n?\s*(```+|~~~+)\s*$/m, '')
      .trim();
  }
  const statusRaw = cur.fields.Status || '';
  const manual = fold(statusRaw).includes(fold(MANUAL_MARK));
  const statusValue = statusRaw.replace(/\(manual\)/i, '').trim();
  const item = {
    code: cur.code,
    num: Number(cur.code.split('-')[1]),
    title: cur.title,
    line: cur.line,
    file: mod.file,
    module: mod.nome,
    slug: mod.slug,
    tipo: canonical('Tipo', cur.fields.Tipo),
    prioridade: canonical('Prioridade', cur.fields.Prioridade),
    tamanho: canonical('Tamanho', cur.fields.Tamanho),
    status: canonical('Status', statusValue),
    manual,
    plano: cur.fields.Plano && !/^[—–-]?$/.test(cur.fields.Plano.trim()) ? cur.fields.Plano : '',
    feito: cur.fields.Feito && !/^[—–-]?$/.test(cur.fields.Feito.trim()) ? cur.fields.Feito : '',
    criado: cur.fields.Criado || '',
    description: description.trim(),
    original,
    fields: cur.fields,
    fieldLines: cur.fieldLines,
    errors: [],
  };
  const where = `${path.basename(mod.file)}:${cur.line} ${cur.code}`;
  for (const f of REQUIRED) {
    if (!(f in cur.fields)) item.errors.push(`${where} sem o campo "${f}"`);
  }
  for (const f of Object.keys(FIELDS)) {
    if (!(f in cur.fields)) continue;
    const key = { Tipo: 'tipo', Prioridade: 'prioridade', Tamanho: 'tamanho', Status: 'status' }[f];
    if (!item[key]) item.errors.push(`${where} ${f} invalido: "${cur.fields[f]}" (valores: ${FIELDS[f].join(' / ')})`);
  }
  if (!item.description) item.errors.push(`${where} sem descricao`);
  mod.errors.push(...item.errors);
  return item;
}

function loadRoadmap() {
  const modules = moduleFiles().map((f) => parseModuleText(readText(f), f));
  const items = modules.flatMap((m) => m.items);
  const errors = modules.flatMap((m) => m.errors);
  const seen = new Map();
  for (const it of items) {
    if (seen.has(it.code)) errors.push(`codigo repetido ${it.code} (${path.basename(seen.get(it.code))} e ${path.basename(it.file)})`);
    else seen.set(it.code, it.file);
  }
  return { modules, items, errors };
}

// ---------------------------------------------------------------- fontes da dedução

// Planos: o que interessa é "Item do roadmap" (um ou mais códigos) e "Status" do cabeçalho.
function parsePlanText(text) {
  let codes = [];
  let status = null;
  let statusRaw = '';
  for (const line of text.split(/\r?\n/)) {
    const clean = stripMarkup(line).replace(/^\s*[-*]\s*/, '');
    const ir = clean.match(/^Item do roadmap\s*:\s*(.*)$/i);
    if (ir && !codes.length) codes = [...ir[1].matchAll(CODE_RE)].map((m) => m[0]);
    const st = clean.match(/^Status\s*:\s*(.*)$/i);
    if (st && !status) {
      statusRaw = st[1].replace(/<!--.*$/, '').trim();
      status = PLAN_STATUSES.find((s) => fold(statusRaw).startsWith(fold(s))) || null;
    }
  }
  return { codes, status, statusRaw };
}

function loadPlans() {
  const { PLANS_DIR } = cfg();
  if (!fs.existsSync(PLANS_DIR)) return [];
  const out = [];
  for (const dir of fs.readdirSync(PLANS_DIR).sort()) {
    const file = path.join(PLANS_DIR, dir, 'plan.md');
    if (!fs.existsSync(file)) continue;
    out.push({ dir, file, rel: rel(file), ...parsePlanText(readText(file)) });
  }
  return out;
}

// Registro de frentes (.maestri-base/frentes-ativas.md): entrada "### <frente>" com
// "Item do roadmap: <código>" = item em execução, mesmo sem plano. O modelo comentado é ignorado.
function parseFrentesText(text) {
  const clean = text.replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  let cur = null;
  for (const line of clean.split(/\r?\n/)) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) {
      cur = { name: h[1], codes: [] };
      out.push(cur);
      continue;
    }
    if (/^##\s/.test(line)) cur = null;
    const ir = stripMarkup(line).replace(/^\s*[-*]\s*/, '').match(/^Item do roadmap\s*:\s*(.*)$/i);
    if (cur && ir) cur.codes.push(...[...ir[1].matchAll(CODE_RE)].map((m) => m[0]));
  }
  return out.filter((f) => f.codes.length);
}

function loadFrentes() {
  const { FRENTES_FILE } = cfg();
  if (!fs.existsSync(FRENTES_FILE)) return [];
  return parseFrentesText(readText(FRENTES_FILE));
}

// Commits que resolvem item sem plano: o código vai entre parênteses no ASSUNTO, ex.
// "fix(pedidos): ajusta X (PED-004)" ou "(PED-004, PED-005)". Só conta o código exato dentro de
// parênteses (o escopo "fix(pedidos)" não tem código, e "PED-0040" não é "PED-004").
function parseCommitSubject(subject) {
  // O escopo do Conventional Commits ("fix(PED-005): ...") não conta: só parênteses depois dele.
  const s = String(subject).replace(/^[a-z]+\([^)]*\)!?:/i, '');
  const codes = [];
  for (const group of s.matchAll(/\(([^()]*)\)/g)) {
    for (const m of group[1].matchAll(CODE_RE)) codes.push(m[0]);
  }
  return codes;
}

// Devolve código → { date, hash } do commit mais recente da branch atual.
function loadCommitCodes() {
  const map = new Map();
  let log;
  try {
    log = execFileSync('git', ['log', '--format=%h%x09%ad%x09%s', '--date=short'], {
      cwd: cfg().ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return map;
  }
  for (const line of log.split(/\r?\n/)) {
    const [hash, date, ...rest] = line.split('\t');
    for (const code of parseCommitSubject(rest.join('\t'))) {
      if (!map.has(code)) map.set(code, { hash, date }); // o git log vem do mais novo ao mais velho
    }
  }
  return map;
}

// Status de desenvolvimento a partir de planos, frentes e commits:
//   1. algum plano "em execução" ou frente ativa citando o item  → em execução
//   2. plano aberto (rascunho, aprovado ou sem Status)          → parado (vence a conclusão por commit)
//   3. planos todos concluídos, ou commit com o código            → feito
//   4. nada que indique execução/conclusão                        → parado
// O plano aberto continua sendo um eixo separado: ele só muda o pill Plano para "com plano".
// O status "cancelado" é sempre manual; valores manuais nunca são sobrescritos.
function deduceStatus(plans, frentes = [], commit = null) {
  if (plans.some((p) => p.status === 'em execução') || frentes.length) return 'em execução';
  if (plans.some((p) => p.status !== 'concluído')) return 'parado';
  if (plans.length || commit) return 'feito';
  return 'parado';
}

module.exports = {
  CONFIG,
  PADRAO,
  FIELDS,
  DEFAULTS,
  MANUAL_MARK,
  CODE_RE,
  setup,
  cfg,
  fold,
  canonical,
  readText,
  parseModuleText,
  parsePlanText,
  parseFrentesText,
  parseCommitSubject,
  loadRoadmap,
  loadPlans,
  loadFrentes,
  loadCommitCodes,
  deduceStatus,
  rel,
};
