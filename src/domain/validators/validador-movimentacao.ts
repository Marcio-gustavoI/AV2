import {
  type EstadoFisico,
  type StatusEquipamento,
  valorEstadoFisico,
} from '../enums.js';
import type { DetalheErro } from '../erros.js';
import { validarTransicaoDeStatus } from '../regras/regra-transicao.js';
import { Validador } from './validador.js';

export interface EntradaValidacaoMovimentacao {
  statusAnterior: StatusEquipamento;
  statusNovo: StatusEquipamento;
  estadoAnterior: EstadoFisico;
  estadoNovo: EstadoFisico;
  triagemCompleta: boolean;
  justificativa?: string | null | undefined;
}

const TAMANHO_MINIMO_JUSTIFICATIVA = 10;

/**
 * ValidadorMovimentacao (R3, R4, R5, R10):
 * - R10: status ou estado físico deve mudar (movimentação sem mudança é inválida).
 * - R4: queda de 2 ou mais categorias no estado físico exige justificativa com pelo menos 10 caracteres.
 * - R3 & R5: se houver mudança de status, delega à estratégia polimórfica `RegraTransicao`.
 */
export class ValidadorMovimentacao extends Validador<EntradaValidacaoMovimentacao> {
  protected coletarErros(entrada: EntradaValidacaoMovimentacao, erros: DetalheErro[]): void {
    const mudouStatus = entrada.statusAnterior !== entrada.statusNovo;
    const mudouEstado = entrada.estadoAnterior !== entrada.estadoNovo;

    // R10: pelo menos um deve mudar
    if (!mudouStatus && !mudouEstado) {
      erros.push({
        campo: 'movimentacao',
        mensagem:
          'Movimentação inválida: deve alterar o status, o estado físico ou ambos.',
      });
      return;
    }

    // R4: queda de 2 ou mais níveis no estado físico exige justificativa >= 10 chars
    const valorAnt = valorEstadoFisico(entrada.estadoAnterior);
    const valorNov = valorEstadoFisico(entrada.estadoNovo);
    if (valorNov <= valorAnt - 2) {
      const justLimpa = (entrada.justificativa ?? '').trim();
      if (justLimpa.length < TAMANHO_MINIMO_JUSTIFICATIVA) {
        erros.push({
          campo: 'justificativa',
          mensagem: `Justificativa obrigatória (mínimo ${TAMANHO_MINIMO_JUSTIFICATIVA} caracteres) quando o estado físico cai 2 ou mais categorias.`,
        });
      }
    }

    // R3 e R5: validar transição de status quando o status mudar
    if (mudouStatus) {
      const erroTransicao = validarTransicaoDeStatus({
        statusAnterior: entrada.statusAnterior,
        statusNovo: entrada.statusNovo,
        triagemCompleta: entrada.triagemCompleta,
      });
      if (erroTransicao !== null) {
        erros.push({
          campo: 'statusNovo',
          mensagem: erroTransicao,
        });
      }
    }
  }
}
