#!/usr/bin/env node
'use strict';

// Leitor de credenciais compartilhado do método Maestri. Quem lê o arquivo é sempre um script; o
// agente nunca abre nem imprime .credenciais/acessos.env. Nenhuma função daqui escreve valor na saída.
//
// Uso em script:   const { requireCreds } = require('<pasta>/cred.cjs');
//                  const { ADMIN_EMAIL } = requireCreds(['ADMIN_EMAIL'], { root });
// Uso no terminal: node cred.cjs --confere ADMIN_EMAIL ADMIN_PASSWORD
//                  (diz só quais chaves existem ou faltam, nunca os valores)

const fs = require('node:fs');
const path = require('node:path');

const CRED_LABEL = '.credenciais/acessos.env';

// Arquivo = <raiz>/.credenciais/acessos.env; raiz padrão = pasta atual (os comandos rodam com cd na raiz).
// MAESTRI_CRED_FILE existe só para teste com arquivo falso; em uso normal fica vazio.
function credPath(options = {}) {
  if (options.file) return options.file;
  if (process.env.MAESTRI_CRED_FILE) return process.env.MAESTRI_CRED_FILE;
  return path.join(options.root || process.cwd(), '.credenciais', 'acessos.env');
}

// Formato CHAVE=valor, uma por linha. Ignora linha vazia, comentário (#) e `export ` no começo.
// Aspas em volta do valor são removidas. Erro nunca cita valor, só o nome do arquivo ou das chaves.
function readCreds(options = {}) {
  let text;
  try {
    text = fs.readFileSync(credPath(options), 'utf8');
  } catch {
    throw new Error(`arquivo ${CRED_LABEL} nao encontrado`);
  }
  const creds = {};
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    creds[key] = value;
  }
  return creds;
}

// Devolve só as chaves pedidas, ou lança erro que cita SÓ os nomes das que faltam.
function requireCreds(keys, options = {}) {
  const creds = readCreds(options);
  const missing = keys.filter((k) => !creds[k]);
  if (missing.length) throw new Error(`chave(s) ausente(s) ou vazia(s) em ${CRED_LABEL}: ${missing.join(', ')}`);
  return Object.fromEntries(keys.map((k) => [k, creds[k]]));
}

function credFileMtime(options = {}) {
  try {
    return fs.statSync(credPath(options)).mtimeMs;
  } catch {
    return null;
  }
}

module.exports = { readCreds, requireCreds, credFileMtime, credPath, CRED_LABEL };

if (require.main === module) {
  const [mode, ...keys] = process.argv.slice(2);
  if (mode !== '--confere' || !keys.length || keys.some((k) => !/^[A-Z][A-Z0-9_]*$/.test(k))) {
    process.stdout.write('RECUSADO uso: cred.cjs --confere <CHAVE> [CHAVE...] (nomes em maiúsculas; nunca imprime valores)\n');
    process.exit(2);
  }
  try {
    const creds = readCreds();
    const missing = keys.filter((k) => !creds[k]);
    process.stdout.write(missing.length
      ? `FALHA chave(s) ausente(s) ou vazia(s) em ${CRED_LABEL}: ${missing.join(', ')}\n`
      : `OK chave(s) presente(s) em ${CRED_LABEL}: ${keys.join(', ')}\n`);
    process.exit(missing.length ? 1 : 0);
  } catch (e) {
    process.stdout.write(`FALHA ${e.message}\n`);
    process.exit(1);
  }
}
