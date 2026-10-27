import 'dotenv/config';
import { execSync } from 'node:child_process';

const urlTeste =
  process.env['DATABASE_URL_TEST'] ??
  'postgresql://greencode:greencode@localhost:5433/greencode_test';

if (!urlTeste.includes('_test')) {
  process.stderr.write(
    'ERRO: DATABASE_URL_TEST deve apontar para um banco de teste contendo "_test".\n',
  );
  process.exit(1);
}

process.stdout.write(`Aplicando migrações no banco de teste: ${urlTeste}\n`);

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: urlTeste,
  },
});

process.stdout.write('Banco de teste preparado com sucesso.\n');
