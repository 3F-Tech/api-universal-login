import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';

/**
 * Log estruturado por request. O pino-http já registra method, url, status e
 * responseTime (duration). Adicionamos api_key_prefix, system_id e ip.
 *
 * O `apiKey`/`system` são injetados pelo middleware apiKeyAuth; como o log de
 * conclusão é emitido no fim da request, esses campos já estão disponíveis.
 */
export const requestLogger = pinoHttp({
  logger,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps(req) {
    // Em runtime `req` é o Request do Express decorado pelos nossos middlewares;
    // o tipo do pino-http é o IncomingMessage cru, então estreitamos aqui.
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
});
