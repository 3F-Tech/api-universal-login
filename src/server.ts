import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { disconnectPrisma } from './config/database.js';

const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'API 3F Core no ar 🚀');
});

/** Graceful shutdown: para de aceitar conexões e fecha o pool do Postgres. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Sinal de encerramento recebido, finalizando...');

  // Força a saída se algo travar o close.
  const forceExit = setTimeout(() => {
    logger.error('Shutdown demorou demais — saída forçada.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await disconnectPrisma();
      logger.info('Conexões encerradas. Até logo.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Erro ao encerrar conexões.');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — encerrando.');
  process.exit(1);
});
