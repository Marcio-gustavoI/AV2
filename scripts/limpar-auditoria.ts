import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

export const RETENCAO_MINIMA_DIAS = 180;

/**
 * Executa a retenção controlada do journal de Auditoria (A1-16, seção 12):
 * - Exige `diasRetencao >= 180` (valores menores são rejeitados).
 * - Abre transação interativa, define `SET LOCAL greencode.limpeza = 'on'`
 *   e remove exclusivamente registros com mais de `diasRetencao` dias.
 */
export async function executarLimpezaAuditoria(
  diasRetencaoInput?: number | string | undefined,
): Promise<{ removidos: number; diasRetencao: number }> {
  const bruto =
    diasRetencaoInput ??
    process.env['AUDITORIA_RETENCAO_DIAS'] ??
    String(RETENCAO_MINIMA_DIAS);
  const diasRetencao = typeof bruto === 'number' ? bruto : Number(bruto);

  if (!Number.isInteger(diasRetencao) || diasRetencao < RETENCAO_MINIMA_DIAS) {
    throw new Error(
      `AUDITORIA_RETENCAO_DIAS inválido (${String(bruto)}). O mínimo exigido pela política de retenção é ${RETENCAO_MINIMA_DIAS} dias (A1-16).`,
    );
  }

  const removidos = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL greencode.limpeza = 'on';");
    const count = await tx.$executeRawUnsafe(
      `DELETE FROM "auditorias" WHERE "criado_em" < NOW() - make_interval(days => $1::int);`,
      diasRetencao,
    );
    return Number(count);
  });

  return { removidos, diasRetencao };
}

const executandoDiretamente =
  process.argv[1] !== undefined && process.argv[1].endsWith('limpar-auditoria.ts');

if (executandoDiretamente) {
  executarLimpezaAuditoria()
    .then(({ removidos, diasRetencao }) => {
      process.stdout.write(
        `✔ Limpeza de auditoria concluída (retenção >= ${diasRetencao} dias): ${removidos} registro(s) removido(s).\n`,
      );
      return prisma.$disconnect();
    })
    .catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`✘ Erro na limpeza de auditoria: ${msg}\n`);
      await prisma.$disconnect();
      process.exit(1);
    });
}
