import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Singleton do Prisma Client.
 *
 * No Prisma 7 o engine embutido foi removido: a conexão é feita por um driver
 * adapter. Usamos @prisma/adapter-pg (sobre node-postgres). A connection string
 * vem do env já validado — nunca hardcode.
 */
const adapter = new PrismaPg(
  {
    connectionString: env.DATABASE_URL,
    // Pool generoso: burst típico de ~14 queries concorrentes (6 rotas × 2
    // paralelas + API key dedup + 1 background update). Com max: 10 o pool
    // saturava e enfileirava queries, causando latência em cascata.
    max: 25,
    // 10 min: muito acima do default de 10s do pg. Evita fechar conexões
    // no meio de períodos curtos de inatividade (o default de 10s é a causa
    // principal do cold start de ~3s após breve inatividade).
    idleTimeoutMillis: 600_000,
    // Timeout explícito ao tentar obter uma conexão do pool.
    connectionTimeoutMillis: 10_000,
    // TCP keepalive: mantém o túnel SSH vivo e detecta conexões fantasma
    // antes que o pg tente reutilizá-las.
    keepAlive: true,
  },
  {
    onPoolError: (err) => logger.error({ err }, 'Erro no pool de conexões do PostgreSQL'),
  },
);

// Em dev o `tsx watch` recarrega módulos; o guard global evita abrir vários
// PrismaClient e esgotar o pool de conexões.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

/** Fecha o pool de conexões. Chamado no graceful shutdown. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
