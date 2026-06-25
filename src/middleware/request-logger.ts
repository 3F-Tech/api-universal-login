import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers para o modo pretty (dev).
// A mensagem do log embute o bloco formatado — assim passa pelo canal do pino
// (transport worker já estabelecido) em vez de process.stdout direto.
// ─────────────────────────────────────────────────────────────────────────────

// Logs de dev em ASCII puro: o transport do pino-pretty roda num worker e escreve
// bytes crus no fd, o que faz box-drawing/acentos virarem mojibake no console do
// Windows (code page legada). Mantendo tudo ASCII, sai legível em qualquer terminal.
const SEP = '-'.repeat(56);

// Remove acentos (NFD + descarta diacríticos) para nomes vindos do banco — ex.:
// "Gestão" -> "Gestao". Evita mojibake na exibição pretty.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
function toAscii(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '');
}

function ptLabel(code: number): string {
  if (code >= 500) return '[ ERRO INTERNO DO SERVIDOR ]';
  if (code >= 400) return '[ ERRO DO CLIENTE ]';
  return '[ SUCESSO ]';
}

function prettyMsg(
  req: { method: string; url: string },
  statusCode: number,
  ms: number | string,
  systemName?: string,
): string {
  const label = ptLabel(statusCode);
  const lines = [
    '',
    SEP,
    `  ${label}`,
    `  Requisicao : ${req.method} ${req.url}`,
    `  Resposta   : ${statusCode}`,
  ];
  if (systemName) lines.push(`  Sistema    : ${toAscii(systemName)}`);
  lines.push(`  Duracao    : ${ms}ms`, SEP);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware unificado: pino-http em ambos os modos.
// Em dev, customSuccessMessage / customErrorMessage formatam o bloco visual.
// Em prod, segue o padrão JSON estruturado.
// ─────────────────────────────────────────────────────────────────────────────

export const requestLogger: RequestHandler = pinoHttp({
  logger,

  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage(req, res, responseTime) {
    if (!env.LOG_PRETTY) return `${req.method} ${req.url} ${res.statusCode}`;
    const r = req as unknown as { system?: { name?: string } };
    return prettyMsg(
      req as { method: string; url: string },
      res.statusCode,
      responseTime,
      r.system?.name,
    );
  },

  customErrorMessage(req, res, err) {
    void err;
    if (!env.LOG_PRETTY) return `${req.method} ${req.url} ${res.statusCode}`;
    const r = req as unknown as { system?: { name?: string } };
    return prettyMsg(req as { method: string; url: string }, res.statusCode, '-', r.system?.name);
  },

  customProps(req) {
    const r = req as unknown as {
      apiKey?: { key_prefix?: string };
      system?: { id?: number };
      ip?: string;
    };
    return {
      api_key_prefix: r.apiKey?.key_prefix,
      system_id: r.system?.id,
      ip: r.ip,
    };
  },

  // Em modo pretty os campos extras poluem o bloco — ocultamos os redundantes.
  ...(env.LOG_PRETTY
    ? {
        serializers: {
          req: () => undefined,
          res: () => undefined,
        },
      }
    : {}),
}) as RequestHandler;
