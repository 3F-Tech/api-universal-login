import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { disconnectPrisma, prisma } from './config/database.js';

async function boot(): Promise<void> {
  // Força o pool a abrir conexão(ões) antes do primeiro request real.
  // Sem isso, o primeiro apiKeyAuth paga o custo de cold start (~3s via
  // SSH tunnel). O SELECT 1 garante que ao menos uma conexão está pronta.
  const t0 = Date.now();
  await prisma.$connect();
  await prisma.$queryRawUnsafe('SELECT 1');
  logger.info({ ms: Date.now() - t0 }, 'Pool do banco aquecido');

  const app = createApp();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'API 3F Core no ar 🚀');
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Sinal de encerramento recebido, finalizando...');

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
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — encerrando.');
  process.exit(1);
});

boot().catch((err) => {
  logger.fatal({ err }, 'Falha ao iniciar o servidor.');
  process.exit(1);
});
