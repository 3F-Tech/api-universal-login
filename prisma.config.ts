import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuração da Prisma CLI (Prisma 7).
 *
 * A partir do Prisma 7 a connection string saiu do schema.prisma e vive aqui.
 * É usada pelos comandos de CLI que tocam o banco (`db pull`, `migrate`, etc).
 * O `import 'dotenv/config'` garante que o .env seja carregado (o Prisma 7 não
 * carrega o .env automaticamente).
 *
 * Em runtime quem conecta é o driver adapter (@prisma/adapter-pg), em
 * src/config/database.ts — não este arquivo.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
