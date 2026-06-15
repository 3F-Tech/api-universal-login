/**
 * CLI para criar uma API Key (resolve o "ovo e galinha": a primeira key não
 * pode vir do endpoint /api-keys, porque ele já exige uma key).
 *
 * Uso (com .env configurado / túnel ou Docker no ar):
 *   npm run key:create -- --system-id=1 --name="App X" --scopes=users:read,users:write
 *   npm run key:create -- --system-name="App Novo" --scopes=admin:*
 *
 * Flags:
 *   --system-id=<id>        Sistema existente
 *   --system-name=<nome>    Cria um novo sistema (se --system-id não for dado)
 *   --name=<nome>           Nome da key (default: "default")
 *   --scopes=a,b,c          Lista separada por vírgula (default: admin:*)
 *   --created-by=<userId>   Usuário ator (opcional)
 *   --expires-at=<ISO>      Expiração opcional (ex: 2026-12-31T23:59:59Z)
 */
import { prisma } from '../src/config/database.js';
import { generateApiKey } from '../src/utils/api-key-generator.js';
import { ADMIN_SCOPE, ALL_SCOPES } from '../src/config/scopes.js';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      const [, key, value] = match;
      if (key) out[key] = value ?? '';
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const scopes = args['scopes']
    ? args['scopes']
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [ADMIN_SCOPE];

  const invalid = scopes.filter((s) => !ALL_SCOPES.includes(s));
  if (invalid.length > 0) {
    console.error(`Scopes inválidos: ${invalid.join(', ')}`);
    console.error(`Scopes válidos: ${ALL_SCOPES.join(', ')}`);
    process.exit(1);
  }

  let systemId = args['system-id'] ? Number(args['system-id']) : undefined;
  if (!systemId && args['system-name']) {
    const created = await prisma.system.create({ data: { name: args['system-name'] } });
    systemId = created.id;
    console.log(`Sistema criado: #${created.id} "${created.name}"`);
  }
  if (!systemId) {
    console.error('Informe --system-id=<id> ou --system-name=<nome>.');
    process.exit(1);
  }

  const generated = generateApiKey();
  const apiKey = await prisma.api_key.create({
    data: {
      system_id: systemId,
      name: args['name'] ?? 'default',
      scopes,
      key_hash: generated.keyHash,
      key_prefix: generated.keyPrefix,
      created_by: args['created-by'] ? Number(args['created-by']) : null,
      expires_at: args['expires-at'] ? new Date(args['expires-at']) : null,
    },
    omit: { key_hash: true },
  });

  console.log('\n✅ API Key criada — COPIE AGORA (não será exibida novamente):\n');
  console.log(`   ${generated.key}\n`);
  console.log(`   id=${apiKey.id}  prefix=${apiKey.key_prefix}  scopes=[${scopes.join(', ')}]`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Erro ao criar API key:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
