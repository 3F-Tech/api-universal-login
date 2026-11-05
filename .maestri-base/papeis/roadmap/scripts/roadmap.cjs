#!/usr/bin/env node
'use strict';

// Script do papel roadmap. Cada subcomando termina numa linha de resultado (OK / ALERTA / FALHA /
// RECUSADO); as linhas antes dela são o detalhe. Rode da raiz do projeto:
//
//   node <pasta da base>/scripts/roadmap.cjs <subcomando> [args]
//
//   atualizar                 status --aplicar + html + portal (boot e "atualize o roadmap")
//   status [--aplicar]        compara o Status dos itens com planos, registro de frentes e commits
//                             "(CÓDIGO)"; --aplicar corrige o que não é manual (e preenche "Feito")
//   html                      status --aplicar + gera <pasta do roadmap>/index.html + recarrega o
//                             portal se ele existir (rode depois de toda escrita nos .md)
//   portal                    abre (ou recarrega) o portal com o index.html
//   validar                   confere o formato de todos os .md do roadmap
//   listar [--abertos]        um item por linha (sem --abertos inclui os feitos)
//   item <CÓDIGO>             o item inteiro, como está no .md
//   buscar <palavras...>      itens parecidos (duplicata), sem acento e sem caixa
//   modulos                   módulos com arquivo + os da configuração ainda sem arquivo
//   codigo <modulo> [--reservar] [--prefixo XYZ --nome "Nome"]
//                             próximo código do módulo; --reservar grava "Último código usado" (cria
//                             o arquivo do módulo se faltar). Módulo novo precisa de --prefixo/--nome
//   mudancas                  o que mudou nos .md desde o último commit + mensagem sugerida
//   commit [--mensagem "..."] commita SÓ os .md do roadmap (nunca push). Só com o ok do dev
//
// Pastas, módulos, nome do portal e prefixo do commit vêm de .maestri-base/roadmap.json (roadmap-lib).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const lib = require('./roadmap-lib.cjs');
const { generate, GROUPS, PRIO_RANK, SIZE_RANK } = require('./gerar-html.cjs');

const { cfg, fold, loadRoadmap, loadPlans, loadFrentes, loadCommitCodes, deduceStatus, rel } = lib;
const MAESTRI = process.env.MAESTRI_CLI || 'maestri';

function out(line) {
  console.log(line);
}

function pathspec() {
  return `${cfg().ROADMAP_REL}/*.md`;
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: cfg().ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

// MAESTRI_CLI existe só para teste (um .cjs falso); em uso normal é o `maestri` do PATH.
function maestri(args) {
  const opts = { cwd: cfg().ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 };
  if (/\.c?js$/.test(MAESTRI)) return execFileSync(process.execPath, [MAESTRI, ...args], opts);
  return execFileSync(MAESTRI, args, opts);
}

function unbom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ---------------------------------------------------------------- status

function status(apply) {
  const { items, errors } = loadRoadmap();
  const plans = loadPlans();
  const frentes = loadFrentes();
  const commits = loadCommitCodes();
  const frentesRel = rel(cfg().FRENTES_FILE);
  const lines = [];
  const byCode = new Map(items.map((i) => [i.code, i]));
  for (const p of plans) {
    if (!p.status) lines.push(`AVISO ${p.rel} sem Status reconhecivel ("${p.statusRaw}"); conta como "com plano"`);
    for (const c of p.codes) {
      if (!byCode.has(c)) lines.push(`AVISO ${p.rel} aponta para ${c}, que nao existe no roadmap`);
    }
  }
  for (const f of frentes) {
    for (const c of f.codes) {
      if (!byCode.has(c)) lines.push(`AVISO a frente "${f.name}" (${frentesRel}) aponta para ${c}, que nao existe no roadmap`);
    }
  }
  const edits = new Map(); // arquivo → [{ line, text }]
  let changed = 0;
  let diverge = 0;
  for (const it of items) {
    if (!it.status) continue; // erro de formato: o validar reporta
    const mine = plans.filter((p) => p.codes.includes(it.code));
    const myFrentes = frentes.filter((f) => f.codes.includes(it.code));
    const commit = commits.get(it.code) || null;
    const want = deduceStatus(mine, myFrentes, commit);
    if (want === it.status) continue;
    // "cancelado" nunca é deduzido: só diverge quando há sinal de execução ou conclusão.
    if (it.status === 'cancelado' && want === 'parado') continue;
    const why = [
      ...mine.map((p) => `${p.rel} (${p.status || p.statusRaw || '?'})`),
      ...myFrentes.map((f) => `frente "${f.name}" em ${frentesRel}`),
      ...(commit ? [`commit ${commit.hash} de ${commit.date}`] : []),
    ].join(', ') || 'nenhum plano, frente ou commit aponta para ele';
    if (it.manual) {
      diverge++;
      lines.push(`DIVERGE ${it.code} (manual): este Status está "${it.status}", planos/frentes/commits dizem "${want}" — ${why}. Pergunte ao dev; nao mudo valor manual.`);
      continue;
    }
    changed++;
    lines.push(`${apply ? 'MUDOU' : 'MUDARIA'} ${it.code}: Status ${it.status} -> ${want} — ${why}`);
    if (!apply) continue;
    const list = edits.get(it.file) || [];
    list.push({ line: it.fieldLines.Status, text: `- **Status:** ${want}` });
    if (want === 'feito' && !it.feito && it.fieldLines.Feito) {
      const candidates = mine.map((p) => lastCommit(p.file)).filter(Boolean);
      if (commit) candidates.push(`${commit.date} · commit ${commit.hash}`);
      const done = candidates.sort().pop();
      if (done) list.push({ line: it.fieldLines.Feito, text: `- **Feito:** ${done}` });
    }
    edits.set(it.file, list);
  }
  for (const [file, list] of edits) {
    const text = lib.readText(file);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const arr = text.split(/\r?\n/);
    for (const e of list) arr[e.line - 1] = e.text;
    fs.writeFileSync(file, arr.join(eol), 'utf8');
  }
  return { lines, changed, diverge, errors, total: items.length, plans: plans.length };
}

// "AAAA-MM-DD · commit abc1234" do último commit que tocou o plan.md (o commit da frente).
function lastCommit(file) {
  try {
    const r = git(['log', '-1', '--format=%ad %h', '--date=short', '--', rel(file)]).trim();
    if (!r) return null;
    const [d, h] = r.split(' ');
    return `${d} · commit ${h}`;
  } catch {
    return null;
  }
}

function cmdStatus(apply) {
  const r = status(apply);
  r.lines.forEach(out);
  if (r.errors.length) out(`ATENCAO ${r.errors.length} erro(s) de formato; rode validar`);
  const verb = apply ? 'aplicada(s)' : 'a aplicar (rode com --aplicar)';
  if (!r.changed && !r.diverge) return out(`OK status: nada a corrigir (${r.total} item(ns), ${r.plans} plano(s))`);
  out(`${r.diverge ? 'ALERTA' : 'OK'} status: ${r.changed} mudanca(s) ${verb}, ${r.diverge} divergencia(s) com valor manual`);
}

// ---------------------------------------------------------------- html + portal

function fileUrl() {
  return pathToFileURL(cfg().HTML_FILE).href;
}

function connectedPortals() {
  const text = maestri(['list']);
  const idx = text.indexOf('Connected portals');
  if (idx < 0) return [];
  return [...text.slice(idx).matchAll(/-\s+name:\s+"([^"]+)"/g)].map((m) => m[1]);
}

// Abre o portal na primeira vez; depois só navega para o mesmo arquivo (relê do disco).
function portal({ createIfMissing }) {
  const { HTML_FILE, PORTAL } = cfg();
  if (!fs.existsSync(HTML_FILE)) generate();
  const url = fileUrl();
  try {
    if (connectedPortals().includes(PORTAL)) {
      maestri(['portal', 'navigate', PORTAL, url]);
      return `OK portal "${PORTAL}" recarregado (${url})`;
    }
    if (!createIfMissing) return `OK portal "${PORTAL}" nao esta aberto; nada a recarregar (abra com: roadmap.cjs portal)`;
    maestri(['portal', 'create', url, PORTAL]);
    return `OK portal "${PORTAL}" aberto (${url})`;
  } catch (e) {
    const msg = String((e.stderr || e.message || '')).trim().split(/\r?\n/)[0];
    return `ALERTA portal nao aberto (${msg || 'maestri indisponivel'}). O arquivo esta em ${rel(HTML_FILE)} (${url})`;
  }
}

// Toda geração do .html passa antes pela dedução do Status: a página nunca mostra status velho.
// `atualizar` faz o mesmo e ainda abre o portal se ele não existir.
function cmdHtml(createPortal) {
  const s = status(true);
  s.lines.forEach(out);
  const g = generate();
  out(g.line.replace(/^(OK|ALERTA) /, 'HTML '));
  const p = portal({ createIfMissing: createPortal });
  out(p.replace(/^(OK|ALERTA) /, 'PORTAL '));
  const bad = s.diverge || s.errors.length || !g.ok || !p.startsWith('OK');
  const { items } = loadRoadmap();
  const by = (k) => items.filter((i) => i.status === k).length;
  const plans = loadPlans();
  const planned = (i) => plans.some((p) => p.codes.includes(i.code));
  const urgent = items.filter((i) => i.prioridade === 'urgente' && !planned(i)).map((i) => i.code);
  out(
    `${bad ? 'ALERTA' : 'OK'} roadmap: ${items.length} item(ns) (parado=${by('parado')} em execucao=${by('em execução')} feito=${by('feito')} cancelado=${by('cancelado')}); urgentes sem plano=${urgent.length}${urgent.length ? ` (${urgent.join(', ')})` : ''}; ${s.changed} status corrigido(s), ${s.diverge} divergencia(s) manual(is), ${s.errors.length} erro(s) de formato; portal ${p.startsWith('OK') ? 'ok' : 'com problema'}`,
  );
}

// ---------------------------------------------------------------- leitura

function cmdValidar() {
  const { items, errors, modules } = loadRoadmap();
  errors.forEach((e) => out(`ERRO ${e}`));
  if (errors.length) return out(`FALHA ${errors.length} erro(s) de formato em ${modules.length} arquivo(s)`);
  out(`OK formato valido: ${items.length} item(ns) em ${modules.length} arquivo(s)`);
}

const GROUP_ORDER = GROUPS.map((g) => g.key);

function cmdListar(onlyOpen) {
  const { items, errors } = loadRoadmap();
  const plans = loadPlans();
  const list = items
    .filter((i) => !onlyOpen || !['feito', 'cancelado'].includes(i.status))
    .sort((a, b) =>
      (GROUP_ORDER.indexOf(a.status) - GROUP_ORDER.indexOf(b.status))
      || ((PRIO_RANK[a.prioridade] ?? 9) - (PRIO_RANK[b.prioridade] ?? 9))
      || ((SIZE_RANK[a.tamanho] ?? 9) - (SIZE_RANK[b.tamanho] ?? 9))
      || a.code.localeCompare(b.code));
  for (const i of list) {
    const hasPlan = plans.some((p) => p.codes.includes(i.code));
    out(`${i.code} | plano=${hasPlan ? 'com plano' : 'sem plano'} | status=${i.status || '?'}${i.manual ? ' (manual)' : ''} | ${i.prioridade || '?'} | ${i.tamanho || '?'} | ${i.tipo || '?'} | ${i.module} | ${i.title}${i.plano ? ` | link: ${i.plano}` : ''}`);
  }
  out(`OK ${list.length} item(ns)${onlyOpen ? ' em aberto' : ''}${errors.length ? ` (ATENCAO ${errors.length} erro(s) de formato)` : ''}`);
}

function itemBlock(it) {
  const text = lib.readText(it.file);
  const lines = text.split(/\r?\n/);
  const { items } = lib.parseModuleText(text, it.file);
  const next = items.find((x) => x.line > it.line);
  return lines.slice(it.line - 1, next ? next.line - 1 : lines.length).join('\n').trimEnd();
}

function cmdItem(code) {
  if (!code) return out('FALHA uso: item <CODIGO>');
  const { items } = loadRoadmap();
  const it = items.find((i) => i.code === code.toUpperCase());
  if (!it) return out(`FALHA ${code} nao existe no roadmap`);
  out(itemBlock(it));
  out(`OK ${it.code} em ${rel(it.file)}`);
}

function cmdBuscar(words) {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'os', 'as', 'ao', 'por', 'para', 'com', 'que', 'se']);
  const terms = [...new Set(fold(words.join(' ')).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !stop.has(w)))];
  if (!terms.length) return out('FALHA uso: buscar <palavras>');
  const { items } = loadRoadmap();
  const hits = items
    .map((i) => {
      const hay = fold(`${i.title} ${i.description} ${i.original}`);
      const found = terms.filter((t) => hay.includes(t));
      return { i, score: found.length, found };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.i.code.localeCompare(b.i.code))
    .slice(0, 10);
  for (const h of hits) out(`${h.i.code} | ${h.score}/${terms.length} (${h.found.join(', ')}) | ${h.i.status} | ${h.i.module} | ${h.i.title}`);
  out(`OK ${hits.length} item(ns) parecido(s) para: ${terms.join(' ')}`);
}

function cmdModulos() {
  const { MODULES, CONFIG_FILE } = cfg();
  const { modules } = loadRoadmap();
  const seen = new Set();
  for (const m of modules) {
    seen.add(m.slug);
    out(`${m.slug} | ${m.nome} | ${m.prefixo || '?'} | ${m.items.length} item(ns)`);
  }
  for (const [slug, m] of Object.entries(MODULES)) {
    if (!seen.has(slug)) out(`${slug} | ${m.nome} | ${m.prefixo} | arquivo ainda nao existe`);
  }
  const missing = Object.keys(MODULES).filter((k) => !seen.has(k)).length;
  out(`OK ${modules.length} modulo(s) com arquivo, ${missing} da configuracao sem arquivo (${CONFIG_FILE || 'sem ' + lib.CONFIG + '; valem os padroes'})`);
}

// ---------------------------------------------------------------- código novo

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function cmdCodigo(args) {
  const { ROADMAP_DIR, MODULES } = cfg();
  const slug = fold(args[0] || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return out('FALHA uso: codigo <modulo> [--reservar] [--prefixo XYZ --nome "Nome"]');
  const reserve = args.includes('--reservar');
  const file = path.join(ROADMAP_DIR, `${slug}.md`);
  const exists = fs.existsSync(file);
  const mod = exists ? lib.parseModuleText(lib.readText(file), file) : null;
  const prefixo = (mod && mod.prefixo) || (MODULES[slug] && MODULES[slug].prefixo) || (arg(args, '--prefixo') || '').toUpperCase();
  const nome = (mod && mod.nome) || (MODULES[slug] && MODULES[slug].nome) || arg(args, '--nome');
  if (!prefixo || !nome) {
    const known = Object.keys(MODULES);
    return out(`FALHA modulo "${slug}" desconhecido: passe --prefixo XYZ (2 a 4 letras) e --nome "Nome" (modulos conhecidos: ${known.length ? known.join(', ') : 'nenhum'})`);
  }
  if (!/^[A-Z]{2,4}$/.test(prefixo)) return out(`FALHA prefixo "${prefixo}" invalido (2 a 4 letras maiusculas)`);
  const { modules } = loadRoadmap();
  const clash = modules.find((m) => m.prefixo === prefixo && m.slug !== slug)
    || Object.entries(MODULES).filter(([s, m]) => m.prefixo === prefixo && s !== slug).map(([s]) => ({ slug: s }))[0];
  if (clash) return out(`FALHA prefixo ${prefixo} ja e do modulo ${clash.slug}`);

  // Nunca reaproveita número: maior entre itens do arquivo, "Último código usado", planos, frentes e commits.
  let max = 0;
  const take = (code) => {
    const m = String(code || '').match(/^([A-Z]{2,4})-(\d+)$/);
    if (m && m[1] === prefixo) max = Math.max(max, Number(m[2]));
  };
  if (mod) {
    mod.items.forEach((i) => take(i.code));
    take(mod.ultimo);
  }
  loadPlans().forEach((p) => p.codes.forEach(take));
  loadFrentes().forEach((f) => f.codes.forEach(take));
  for (const c of loadCommitCodes().keys()) take(c);
  const code = `${prefixo}-${String(max + 1).padStart(3, '0')}`;
  if (!reserve) return out(`OK proximo codigo ${code} (modulo ${nome}, ${rel(file)}${exists ? '' : ', arquivo ainda nao existe'}); nada gravado`);

  if (!exists) {
    fs.mkdirSync(ROADMAP_DIR, { recursive: true });
    fs.writeFileSync(
      file,
      `# Roadmap — ${nome}\n\n- **Prefixo:** ${prefixo}\n- **Último código usado:** ${code}\n\n<!-- Mantido pelo agente do roadmap. Formato: references/formato.md da base do papel roadmap -->\n`,
      'utf8',
    );
    return out(`OK codigo ${code} reservado; criei ${rel(file)} (modulo ${nome}). Acrescente o item no fim do arquivo`);
  }
  const text = lib.readText(file);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const arr = text.split(/\r?\n/);
  const firstItem = arr.findIndex((l) => /^##\s/.test(l));
  const head = firstItem < 0 ? arr.length : firstItem;
  const at = arr.slice(0, head).findIndex((l) => /^-\s+\*\*[ÚU]ltimo c[óo]digo usado:\*\*/i.test(l));
  if (at >= 0) arr[at] = `- **Último código usado:** ${code}`;
  else {
    const pre = arr.slice(0, head).findIndex((l) => /^-\s+\*\*Prefixo:\*\*/i.test(l));
    arr.splice(pre >= 0 ? pre + 1 : 1, 0, `- **Último código usado:** ${code}`);
  }
  fs.writeFileSync(file, arr.join(eol), 'utf8');
  out(`OK codigo ${code} reservado em ${rel(file)}. Acrescente o item no fim do arquivo`);
}

// ---------------------------------------------------------------- mudanças + commit

function headModules() {
  let names;
  try {
    names = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', cfg().ROADMAP_REL]).split(/\r?\n/).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return names.map((n) => lib.parseModuleText(unbom(git(['show', `HEAD:${n}`])), path.join(cfg().ROOT, n)));
}

function changes() {
  const prefix = cfg().COMMIT_PREFIX;
  const before = new Map(headModules().flatMap((m) => m.items).map((i) => [i.code, i]));
  const now = loadRoadmap();
  const after = new Map(now.items.map((i) => [i.code, i]));
  const detail = [];
  const parts = [];
  for (const [code, it] of after) {
    const old = before.get(code);
    if (!old) {
      detail.push(`+ ${code} ${it.title} (${it.module}; ${it.tipo}, ${it.prioridade}, ${it.tamanho}, ${it.status})`);
      parts.push(`+${code}`);
      continue;
    }
    const diffs = [];
    const short = [];
    const cmp = (label, a, b, s) => {
      if ((a || '') !== (b || '')) {
        diffs.push(`${label}: ${a || '—'} → ${b || '—'}`);
        if (s) short.push(s);
      }
    };
    cmp('status', old.status + (old.manual ? ' (manual)' : ''), it.status + (it.manual ? ' (manual)' : ''), `${code} → ${it.status}`);
    cmp('prioridade', old.prioridade, it.prioridade, `${code} prioridade → ${it.prioridade}`);
    cmp('tamanho', old.tamanho, it.tamanho, `${code} tamanho → ${it.tamanho}`);
    cmp('tipo', old.tipo, it.tipo, `${code} tipo → ${it.tipo}`);
    cmp('módulo', old.module, it.module, `${code} → ${it.module}`);
    cmp('título', old.title, it.title, `${code} título`);
    cmp('plano', old.plano, it.plano, `${code} plano`);
    cmp('feito', old.feito, it.feito, null);
    if (old.description !== it.description || old.original !== it.original) {
      diffs.push('descrição/texto original alterados');
      short.push(`${code} descrição`);
    }
    if (diffs.length) {
      detail.push(`~ ${code} ${it.title}: ${diffs.join('; ')}`);
      parts.push(...[...new Set(short)].slice(0, 2));
    }
  }
  for (const [code, it] of before) {
    if (!after.has(code)) {
      detail.push(`- ${code} ${it.title} (removido)`);
      parts.push(`-${code}`);
    }
  }
  let subject = prefix;
  for (const p of parts) {
    const piece = (subject === prefix ? '' : ', ') + p;
    if ((subject + piece).length > 96) {
      subject += ', ...';
      break;
    }
    subject += piece;
  }
  if (!parts.length) subject += 'ajustes de formato';
  return { detail, subject, errors: now.errors };
}

function pendingFiles() {
  return git(['status', '--porcelain', '--untracked-files=all', '--', pathspec()]).split(/\r?\n/).filter(Boolean);
}

function cmdMudancas() {
  let files;
  try {
    files = pendingFiles();
  } catch (e) {
    return out(`FALHA git status: ${String(e.stderr || e.message).trim().split(/\r?\n/)[0]}`);
  }
  if (!files.length) return out(`OK nada a commitar em ${pathspec()}`);
  files.forEach((f) => out(`ARQUIVO ${f}`));
  const c = changes();
  c.detail.forEach((d) => out(d));
  if (c.errors.length) out(`ATENCAO ${c.errors.length} erro(s) de formato: corrija antes do commit (rode validar)`);
  out(`MENSAGEM ${c.subject}`);
  out(`OK ${files.length} arquivo(s), ${c.detail.length} item(ns) mudado(s). Mostre ao dev e espere o ok antes do commit`);
}

function cmdCommit(args) {
  const prefix = cfg().COMMIT_PREFIX;
  let files;
  try {
    files = pendingFiles();
  } catch (e) {
    return out(`FALHA git status: ${String(e.stderr || e.message).trim().split(/\r?\n/)[0]}`);
  }
  if (!files.length) return out(`OK nada a commitar em ${pathspec()}`);
  const c = changes();
  if (c.errors.length) return out(`FALHA ${c.errors.length} erro(s) de formato nos .md; corrija antes (rode validar). Nada commitado`);
  const custom = arg(args, '--mensagem');
  const subject = custom ? custom.trim() : c.subject;
  if (!subject.startsWith(prefix)) return out(`RECUSADO a mensagem precisa comecar com "${prefix}". Nada commitado`);
  const body = c.detail.join('\n');
  try {
    // add + commit só com o pathspec do roadmap: o que outra sessão deixou no índice fica de fora.
    git(['add', '-A', '--', pathspec()]);
    const cargs = ['commit', '-m', subject];
    if (body) cargs.push('-m', body);
    cargs.push('--', pathspec());
    git(cargs);
  } catch (e) {
    return out(`FALHA git commit: ${String(e.stderr || e.stdout || e.message).trim().split(/\r?\n/).slice(0, 3).join(' | ')}`);
  }
  const hash = git(['rev-parse', '--short', 'HEAD']).trim();
  const branch = git(['branch', '--show-current']).trim();
  out(`OK commit ${hash} na ${branch}: ${subject} (sem push)`);
}

// ---------------------------------------------------------------- main

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'atualizar': return cmdHtml(true);
    case 'status': return cmdStatus(args.includes('--aplicar'));
    case 'html': return cmdHtml(false);
    case 'portal': return out(portal({ createIfMissing: true }));
    case 'validar': return cmdValidar();
    case 'listar': return cmdListar(args.includes('--abertos'));
    case 'item': return cmdItem(args[0]);
    case 'buscar': return cmdBuscar(args);
    case 'codigo': return cmdCodigo(args);
    case 'modulos': return cmdModulos();
    case 'mudancas': return cmdMudancas();
    case 'commit': return cmdCommit(args);
    default:
      return out('FALHA subcomando desconhecido. Use: atualizar | status [--aplicar] | html | portal | validar | listar [--abertos] | item <COD> | buscar <palavras> | modulos | codigo <modulo> [--reservar] | mudancas | commit [--mensagem "..."]');
  }
}

module.exports = { status, changes, portal };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    out(`FALHA ${e.message}`);
    process.exitCode = 1;
  }
}
