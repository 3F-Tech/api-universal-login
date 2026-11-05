'use strict';

// Testes do leitor com arquivos falsos (nenhuma credencial real). Rodar: node --test ferramentas/credenciais/cred.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { readCreds, requireCreds, credFileMtime, credPath } = require('./cred.cjs');

const CLI = path.join(__dirname, 'cred.cjs');

function raiz(t, conteudo) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-teste-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (conteudo !== undefined) {
    fs.mkdirSync(path.join(root, '.credenciais'));
    fs.writeFileSync(path.join(root, '.credenciais', 'acessos.env'), conteudo);
  }
  return root;
}

const FALSO = '﻿# comentário\nADMIN_EMAIL=admin@example.invalid\nexport ADMIN_PASSWORD="senha falsa"\n\nTESTE_VENDEDOR_EMAIL=\'v@example.invalid\'\nlinha sem igual\n=sem chave\nTESTE_VENDEDOR_PASSWORD=a=b\n';

test('lê CHAVE=valor com BOM, comentário, export, aspas e = no valor', (t) => {
  const root = raiz(t, FALSO);
  const creds = readCreds({ root });
  assert.equal(creds.ADMIN_EMAIL, 'admin@example.invalid');
  assert.equal(creds.ADMIN_PASSWORD, 'senha falsa');
  assert.equal(creds.TESTE_VENDEDOR_EMAIL, 'v@example.invalid');
  assert.equal(creds.TESTE_VENDEDOR_PASSWORD, 'a=b');
  assert.equal(Object.keys(creds).length, 4);
});

test('requireCreds devolve só o pedido; ausência cita só nomes, nunca valores', (t) => {
  const root = raiz(t, FALSO);
  assert.deepEqual(requireCreds(['ADMIN_EMAIL'], { root }), { ADMIN_EMAIL: 'admin@example.invalid' });
  assert.throws(() => requireCreds(['ADMIN_EMAIL', 'TESTE_GERENTE_EMAIL'], { root }), (e) => {
    assert.match(e.message, /ausente\(s\).*TESTE_GERENTE_EMAIL/);
    assert.doesNotMatch(e.message, /admin@example|senha falsa/);
    return true;
  });
});

test('arquivo ausente vira erro sem caminho absoluto; mtime nulo', (t) => {
  const root = raiz(t);
  assert.throws(() => readCreds({ root }), /arquivo \.credenciais\/acessos\.env nao encontrado/);
  assert.equal(credFileMtime({ root }), null);
  assert.equal(credPath({ root }), path.join(root, '.credenciais', 'acessos.env'));
});

test('CLI --confere diz quais chaves existem sem imprimir valores', (t) => {
  const root = raiz(t, FALSO);
  const run = (...args) => cp.spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, MAESTRI_CRED_FILE: '' } });
  const ok = run('--confere', 'ADMIN_EMAIL', 'ADMIN_PASSWORD');
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^OK chave\(s\) presente\(s\)/);
  const falta = run('--confere', 'ADMIN_EMAIL', 'TESTE_GERENTE_PASSWORD');
  assert.equal(falta.status, 1);
  assert.match(falta.stdout, /^FALHA .*TESTE_GERENTE_PASSWORD/);
  for (const r of [ok, falta]) assert.doesNotMatch(r.stdout + r.stderr, /admin@example|senha falsa|a=b/);
  assert.equal(run('ADMIN_EMAIL').status, 2);
  assert.equal(run('--confere', 'admin_email').status, 2);
});
