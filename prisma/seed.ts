/**
 * Seed de DESENVOLVIMENTO (opcional). Cria um setup mínimo e testável:
 *   - um sistema "Demo System"
 *   - uma API Key admin (impressa no console)
 *   - um usuário demo (demo@3fventure.com.br / senha "demo12345")
 *   - o vínculo usuário <-> sistema (pra /auth/validate funcionar)
 *
 * Rode com: npm run db:seed
 * NÃO use em produção.
 */
import { prisma } from '../src/config/database.js';
import { hashPassword } from '../src/utils/bcrypt.js';
import { generateApiKey } from '../src/utils/api-key-generator.js';
import { ADMIN_SCOPE } from '../src/config/scopes.js';

const DEMO_EMAIL = 'demo@3fventure.com.br';
const DEMO_PASSWORD = 'demo12345';

async function main(): Promise<void> {
  // 1. Sistema demo
  let system = await prisma.system.findFirst({ where: { name: 'Demo System' } });
  system ??= await prisma.system.create({
    data: { name: 'Demo System', description: 'Sistema de exemplo (seed dev)' },
  });
  console.log(`Sistema: #${system.id} "${system.name}"`);

  // 2. API Key admin
  const generated = generateApiKey();
  const apiKey = await prisma.api_key.create({
    data: {
      system_id: system.id,
      name: 'seed-admin',
      scopes: [ADMIN_SCOPE],
      key_hash: generated.keyHash,
      key_prefix: generated.keyPrefix,
    },
  });
  console.log(`API Key admin (#${apiKey.id}) — use no header X-API-Key:\n   ${generated.key}`);

  // 3. Usuário demo
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  user ??= await prisma.user.create({
    data: {
      name: 'Demo User',
      email: DEMO_EMAIL,
      password: await hashPassword(DEMO_PASSWORD),
      role: 'collaborator',
    },
  });
  console.log(`Usuário demo: #${user.id} (${DEMO_EMAIL} / ${DEMO_PASSWORD})`);

  // 4. Vínculo usuário <-> sistema
  const link = await prisma.systems_users.findFirst({
    where: { system_id: system.id, user_id: user.id },
  });
  if (!link) {
    await prisma.systems_users.create({ data: { system_id: system.id, user_id: user.id } });
  }

  console.log('\n✅ Seed concluído. Teste o login:');
  console.log('   POST /auth/validate');
  console.log(`   Header: X-API-Key: ${generated.key}`);
  console.log(`   Body:   { "email": "${DEMO_EMAIL}", "password": "${DEMO_PASSWORD}" }`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Erro no seed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
