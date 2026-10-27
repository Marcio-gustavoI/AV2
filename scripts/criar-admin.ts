import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import {
  PrismaAuditoriaRepository,
  PrismaGerenciadorTransacao,
} from '../src/modules/auditoria/auditoria.repository.js';
import { PrismaUsuarioRepository } from '../src/modules/usuario/usuario.repository.js';
import { UsuarioService } from '../src/modules/usuario/usuario.service.js';

/**
 * Script de provisionamento inicial do primeiro ADMIN (C3, A1-09).
 * Lê `ADMIN_EMAIL` e `ADMIN_SENHA` do ambiente ou solicita interativamente no terminal.
 * Nunca cria administrador com senha padrão.
 */
export async function executarProvisionamentoAdmin(opcoes?: {
  email?: string | undefined;
  senha?: string | undefined;
}): Promise<{ id: string; email: string; criadoAgora: boolean }> {
  let email = opcoes?.email ?? process.env['ADMIN_EMAIL'];
  let senha = opcoes?.senha ?? process.env['ADMIN_SENHA'];

  if ((!email || !senha) && input.isTTY) {
    const rl = readline.createInterface({ input, output });
    try {
      if (!email) {
        email = (await rl.question('E-mail do ADMIN inicial: ')).trim();
      }
      if (!senha) {
        senha = (await rl.question('Senha do ADMIN (mín. 10 chars, letras e números): ')).trim();
      }
    } finally {
      rl.close();
    }
  }

  if (!email || !senha) {
    throw new Error(
      'ADMIN_EMAIL e ADMIN_SENHA são obrigatórios para provisionar o administrador inicial (nunca usamos senha padrão).',
    );
  }

  const transacao = new PrismaGerenciadorTransacao(prisma);
  const auditoriaRepo = new PrismaAuditoriaRepository(prisma);
  const usuarioRepo = new PrismaUsuarioRepository(prisma);
  const usuarioService = new UsuarioService(
    usuarioRepo,
    auditoriaRepo,
    transacao,
    env.BCRYPT_ROUNDS,
  );

  const { usuario, criadoAgora } = await usuarioService.provisionarAdminInicial({
    email,
    senha,
  });

  return {
    id: usuario.id,
    email: usuario.email,
    criadoAgora,
  };
}

const executandoDiretamente =
  process.argv[1] !== undefined && process.argv[1].endsWith('criar-admin.ts');

if (executandoDiretamente) {
  executarProvisionamentoAdmin()
    .then((res) => {
      if (res.criadoAgora) {
        output.write(`✔ Administrador provisionado com sucesso: ${res.email} (${res.id})\n`);
      } else {
        output.write(`ℹ Administrador já existente mantido: ${res.email} (${res.id})\n`);
      }
      return prisma.$disconnect();
    })
    .catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`✘ Falha ao provisionar administrador: ${msg}\n`);
      await prisma.$disconnect();
      process.exit(1);
    });
}
