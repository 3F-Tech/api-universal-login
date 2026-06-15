// Roda antes de qualquer teste (vitest setupFiles).
// Garante um ambiente hermético: os testes smoke/unit NÃO tocam o banco real.
// Definimos as variáveis ANTES de qualquer import de src/* (que importa env.ts).
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5432/test_db';
process.env['LOG_LEVEL'] ??= 'fatal';
// Sem pino-pretty em testes (evita worker thread segurando o processo).
process.env['LOG_PRETTY'] ??= 'false';
