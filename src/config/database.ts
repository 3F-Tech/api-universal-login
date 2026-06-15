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
  { connectionString: env.DATABASE_URL },
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
