#!/usr/bin/env node
'use strict';

// Gera <pasta do roadmap>/index.html a partir de TODOS os <pasta do roadmap>/*.md. Determinístico: a
// mesma entrada dá a mesma página (só a hora da geração muda; build(now) recebe a hora). Sem
// JavaScript: cada item usa <details>/<summary> para mostrar sua descrição. Não embute recomendação:
// mostra a classificação do dev.
//
//   node <pasta da base>/scripts/gerar-html.cjs
//
// Saída: uma linha OK/ALERTA. Com erro de formato num .md, a página sai assim mesmo, com os erros
// numa caixa no topo (página velha seria pior), e a linha vira ALERTA.

const fs = require('fs');
const { FIELDS, cfg, loadRoadmap, loadPlans, rel } = require('./roadmap-lib.cjs');

const GROUPS = [
  { key: 'parado', title: 'Parado' },
  { key: 'em execução', title: 'Em execução' },
  { key: 'feito', title: 'Feito' },
  { key: 'cancelado', title: 'Cancelado' },
];
const PRIO_RANK = { urgente: 0, alta: 1, normal: 2, 'mínima': 3 };
const SIZE_RANK = { pequeno: 0, 'médio': 1, grande: 2, 'muito grande': 3 };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugClass(v) {
  return String(v || 'x').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function byOrder(a, b) {
  const p = (PRIO_RANK[a.prioridade] ?? 9) - (PRIO_RANK[b.prioridade] ?? 9);
  if (p) return p;
  const t = (SIZE_RANK[a.tamanho] ?? 9) - (SIZE_RANK[b.tamanho] ?? 9);
  if (t) return t;
  return a.code.localeCompare(b.code);
}

const TAG_LABEL = { tipo: '', prio: 'prioridade', tam: 'tamanho', plano: '', status: '' };

function tag(kind, value, withLabel = true) {
  const label = withLabel && TAG_LABEL[kind] ? `<i>${TAG_LABEL[kind]}</i> ` : '';
  if (!value) return `<span class="tag tag-invalido">${label}?</span>`;
  return `<span class="tag ${kind}-${slugClass(value)}">${label}${esc(value)}</span>`;
}

function descriptionHtml(description) {
  const paragraphs = String(description || '')
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n');
}

function row(it, planned) {
  const plan = planned.has(it.code) ? 'com plano' : 'sem plano';
  const extra = [];
  if (it.plano) extra.push(`plano: ${esc(it.plano)}`);
  if (it.status === 'feito' && it.feito) extra.push(`feito: ${esc(it.feito)}`);
  if (it.manual) extra.push('status manual');
  return `      <li class="item">
        <details>
          <summary class="item-summary">
            <span class="code">${esc(it.code)}</span>
            <span class="title">${esc(it.title)}</span>
            <span class="module">${esc(it.module)}</span>
            <span class="tags">${tag('tipo', it.tipo)}${tag('prio', it.prioridade)}${tag('tam', it.tamanho)}${tag('plano', plan, false)}${it.status === 'parado' ? '' : tag('status', it.status, false)}</span>${
    extra.length ? `\n            <span class="extra">${extra.join(' · ')}</span>` : ''
  }
          </summary>
          <div class="description">
            ${descriptionHtml(it.description)}
          </div>
        </details>
      </li>`;
}

function build(now = new Date()) {
  const { items, errors } = loadRoadmap();
  const plans = loadPlans();
  const planned = new Set(plans.flatMap((p) => p.codes));
  const count = (k) => items.filter((i) => i.status === k).length;
  const urgentNoPlan = items.filter((i) => i.prioridade === 'urgente' && !planned.has(i.code)).sort(byOrder);
  const invalid = items.filter((i) => !i.status);
  const stamp = now.toLocaleString('pt-BR', { timeZone: cfg().TZ, dateStyle: 'short', timeStyle: 'short' });

  const summary = GROUPS.map(
    (g) => `<div class="stat stat-${slugClass(g.key)}"><b>${count(g.key)}</b><span>${esc(g.title)}</span></div>`,
  ).join('\n      ');
  const urgent = urgentNoPlan.length
    ? `<p class="urgent">Urgentes sem plano: ${urgentNoPlan.map((i) => `<b>${esc(i.code)}</b> ${esc(i.title)}`).join(' · ')}</p>`
    : '<p class="muted">Nenhum item urgente sem plano.</p>';

  const sections = GROUPS.map((g) => {
    const list = items.filter((i) => i.status === g.key).sort(byOrder);
    if (!list.length) return '';
    return `  <section class="group group-${slugClass(g.key)}">
    <h2>${esc(g.title)} <small>${list.length}</small></h2>
    <ul>
${list.map((it) => row(it, planned)).join('\n')}
    </ul>
  </section>`;
  }).filter(Boolean);
  if (invalid.length) {
    sections.push(`  <section class="group">
    <h2>Status inválido <small>${invalid.length}</small></h2>
    <ul>
${invalid.sort(byOrder).map((it) => row(it, planned)).join('\n')}
    </ul>
  </section>`);
  }

  const errorBox = errors.length
    ? `  <div class="errors"><b>Erros de formato nos .md (corrija e gere de novo):</b><ul>${errors
      .map((e) => `<li>${esc(e)}</li>`)
      .join('')}</ul></div>\n`
    : '';
  const empty = items.length
    ? ''
    : '  <p class="empty">Roadmap vazio. Descreva um passo ao agente do roadmap para registrar o primeiro item.</p>\n';
  const legend = Object.entries(FIELDS)
    .filter(([k]) => !['Status', 'Plano'].includes(k))
    .map(([k, vs]) => `<span class="legend-k">${esc(k)}:</span> ${vs.map((v) => tag({ Tipo: 'tipo', Prioridade: 'prio', Tamanho: 'tam' }[k], v, false)).join('')}`)
    .join('<br>');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roadmap</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --fg: #1d2330; --muted: #6b7385; --line: #e3e6ec;
    --red: #c62828; --orange: #d9730d; --blue: #2f6fd1; --gray: #8a93a6; --green: #2e8b57;
    --violet: #7b4fc9; --teal: #13897f; --amber: #b7791f;
    --status-parado: #cbd5e1; --status-execucao: #2563eb; --status-feito: #16a34a; --status-cancelado: #dc2626;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12151c; --card: #1b1f29; --fg: #e6e9f0; --muted: #98a0b3; --line: #2b3140;
      --red: #ef6b6b; --orange: #f0a04b; --blue: #6ea2ff; --gray: #8a93a6; --green: #5cc58a;
      --violet: #ad8cff; --teal: #4fd1c5; --amber: #e8b04f;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 "Segoe UI", system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
  header h1 { margin: 0 0 2px; font-size: 22px; }
  .muted, header p { color: var(--muted); margin: 4px 0; }
  .stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 8px; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; min-width: 120px; }
  .stat b { display: block; font-size: 22px; }
  .stat span { color: var(--muted); font-size: 12px; }
  .stat-parado b { color: var(--status-parado); }
  .stat-em-execucao b { color: var(--status-execucao); }
  .stat-feito b { color: var(--status-feito); }
  .stat-cancelado b { color: var(--status-cancelado); }
  .urgent { color: var(--red); margin: 8px 0 0; }
  .errors { border: 1px solid var(--red); color: var(--red); border-radius: 8px; padding: 10px 14px; margin: 16px 0; }
  .errors ul { margin: 6px 0 0; padding-left: 18px; }
  .empty { background: var(--card); border: 1px dashed var(--line); border-radius: 8px; padding: 24px; text-align: center; color: var(--muted); }
  .group { margin-top: 26px; }
  .group h2 { font-size: 16px; margin: 0 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  .group h2 small { color: var(--muted); font-weight: normal; }
  ul { list-style: none; margin: 0; padding: 0; }
  .item { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 0; margin-bottom: 6px; }
  .item details { width: 100%; }
  .item-summary { display: grid; grid-template-columns: 80px minmax(0, 1fr) 140px 400px; position: relative; align-items: baseline; gap: 2px 12px; cursor: pointer; list-style: none; padding: 7px 34px 7px 12px; }
  .item-summary::-webkit-details-marker { display: none; }
  .item-summary::after { content: '+'; position: absolute; top: 7px; right: 12px; color: var(--muted); font-size: 16px; line-height: 1; }
  .item details[open] > .item-summary::after { content: '−'; }
  .code { font-family: Consolas, "Cascadia Mono", monospace; font-weight: 600; }
  .module { color: var(--muted); font-size: 12px; }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .extra { grid-column: 2 / -1; color: var(--muted); font-size: 12px; }
  .description { border-top: 1px solid var(--line); padding: 2px 12px 10px; color: var(--fg); }
  .description p { margin: 8px 0 0; }
  .tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid currentColor; white-space: nowrap; margin-right: 2px; }
  .tipo-funcionalidade { color: var(--blue); }
  .tipo-melhoria-tecnica { color: var(--violet); }
  .tipo-suporte-correcao { color: var(--orange); }
  .tipo-dependencia-externa { color: var(--gray); }
  .tipo-verificacao { color: var(--teal); }
  .prio-urgente { color: #fff; background: var(--red); border-color: var(--red); }
  .prio-alta { color: var(--orange); }
  .prio-normal { color: var(--blue); }
  .prio-minima { color: var(--gray); }
  .tam-pequeno, .tam-medio, .tam-grande, .tam-muito-grande { color: var(--muted); }
  .tam-grande { font-weight: 600; }
  .tam-muito-grande { font-weight: 700; color: var(--fg); }
  .tag i { font-style: normal; opacity: .7; }
  .tag-invalido { color: var(--red); }
  .plano-com-plano { color: var(--teal); }
  .plano-sem-plano { color: var(--amber); }
  .status-parado { color: var(--status-parado); }
  .status-em-execucao { color: var(--status-execucao); }
  .status-feito { color: var(--status-feito); }
  .status-cancelado { color: var(--status-cancelado); }
  .group-feito .item { opacity: .55; }
  .legend { margin-top: 32px; color: var(--muted); font-size: 12px; line-height: 2; }
  .legend-k { display: inline-block; min-width: 76px; }
  @media (max-width: 900px) { .item-summary { grid-template-columns: 80px minmax(0, 1fr); } .item-summary .module, .item-summary .tags, .item-summary .extra { grid-column: 2; } }
</style>
</head>
<body>
<main>
  <header>
    <h1>Roadmap</h1>
    <p>${items.length} ${items.length === 1 ? 'item' : 'itens'} · gerado em ${esc(stamp)} a partir de ${esc(cfg().ROADMAP_REL)}/*.md (este arquivo é gerado; edite os .md pelo agente do roadmap)</p>
  </header>
  <div class="stats">
      ${summary}
  </div>
  ${urgent}
${errorBox}${empty}${sections.join('\n')}
  <p class="legend">${legend}</p>
</main>
</body>
</html>
`;
  return { html, items, errors };
}

function generate(now) {
  const { HTML_FILE, ROADMAP_DIR } = cfg();
  const { html, items, errors } = build(now);
  fs.mkdirSync(ROADMAP_DIR, { recursive: true });
  fs.writeFileSync(HTML_FILE, html, 'utf8');
  const counts = GROUPS.map((g) => `${g.key}=${items.filter((i) => i.status === g.key).length}`).join(' ');
  if (errors.length) {
    return { ok: false, line: `ALERTA ${rel(HTML_FILE)} gerado com ${errors.length} erro(s) de formato (aparecem no topo da pagina): ${errors.slice(0, 3).join(' | ')}${errors.length > 3 ? ' | ...' : ''}` };
  }
  return { ok: true, line: `OK ${rel(HTML_FILE)} gerado: ${items.length} item(ns) (${counts})` };
}

module.exports = { build, generate, GROUPS, PRIO_RANK, SIZE_RANK };

if (require.main === module) {
  try {
    console.log(generate().line);
  } catch (e) {
    console.log(`FALHA ${e.message}`);
    process.exitCode = 1;
  }
}
