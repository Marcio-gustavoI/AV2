import { Papel } from '../../src/domain/index.js';
import { prisma } from '../../src/lib/prisma.js';

export const ID_USUARIO_TESTE_PADRAO = '00000000-0000-0000-0000-000000000001';

/**
 * Limpa todas as tabelas do banco de teste em uma única transação usando
 * `SET LOCAL session_replication_role = replica` para contornar o trigger de
 * retenção/imutabilidade da Auditoria e Movimentação apenas em ambiente de teste.
 */
export async function limparBanco(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'] ?? '';
  if (!dbUrl.includes('_test')) {
    throw new Error(
      `Recusando limpar banco que não é de teste (DATABASE_URL=${dbUrl}).`,
    );
  }

  await prisma.$transaction([
    prisma.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica';"),
    prisma.$executeRawUnsafe(
      'TRUNCATE TABLE auditorias, movimentacoes, equipamentos, lotes, contratos, organizacoes, parametros, usuarios RESTART IDENTITY CASCADE;',
    ),
    prisma.$executeRawUnsafe('ALTER SEQUENCE seq_codigo_barras RESTART WITH 1;'),
  ]);
}

/**
 * Cria ou atualiza um usuário de teste no banco para satisfazer chaves estrangeiras
 * de Auditoria e Movimentação durante testes de integração.
 */
export async function garantirUsuarioTesteNoBanco(
  id: string = ID_USUARIO_TESTE_PADRAO,
  papel: Papel = Papel.ADMIN,
  email: string = `teste-${id.slice(-4)}@greencode.local`,
): Promise<{ id: string; email: string; papel: Papel }> {
  await prisma.usuario.upsert({
    where: { id },
    update: { papel, email, ativo: true },
    create: {
      id,
      email,
      senhaHash: '$2b$04$hashFicticioApenasParaIntegracaoDeBancoDeTeste00000000',
      papel,
      ativo: true,
    },
  });
  return { id, email, papel };
}
