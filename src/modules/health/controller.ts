import type { Request, Response } from 'express';
import { prisma } from '../../config/database.js';

/** Liveness: responde sem tocar o banco (bom pra smoke test e load balancer). */
export function health(_req: Request, res: Response): void {
  res.status(200).json({
    data: {
      status: 'ok',
      service: 'api-universal-login',
      uptime_s: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}

/** Readiness: verifica conectividade com o PostgreSQL. */
export async function ready(_req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ data: { status: 'ready', database: 'up' } });
  } catch {
    res.status(503).json({
      error: { code: 'NOT_READY', message: 'Banco de dados indisponível.' },
    });
  }
}
