// Roda antes de qualquer teste (vitest setupFiles).
// Garante um ambiente hermético: os testes smoke/unit NÃO tocam o banco real.
// Definimos as variáveis ANTES de qualquer import de src/* (que importa env.ts).
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5432/test_db';
process.env['LOG_LEVEL'] ??= 'fatal';
// Sem pino-pretty em testes (evita worker thread segurando o processo).
process.env['LOG_PRETTY'] ??= 'false';
// DEFAULT_PASSWORD_HASH é obrigatória (sem default no schema) — valor dummy só pra validar o boot.
process.env['DEFAULT_PASSWORD_HASH'] ??=
  '$2b$12$yGHHA9loDpKmiepnhTzYCOIKJTFb3L3Olr6gUxAkSVuNOKKuFjUXa';
