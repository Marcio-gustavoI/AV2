import type { EstadoFisico, StatusEquipamento } from '../enums.js';
import { ValidadorMovimentacao } from '../validators/validador-movimentacao.js';

export interface CriarMovimentacaoInput {
  equipamentoId: string;
  usuarioId: string;
  statusAnterior: StatusEquipamento;
  statusNovo?: StatusEquipamento | undefined;
  estadoAnterior: EstadoFisico;
  estadoNovo?: EstadoFisico | undefined;
  triagemCompleta: boolean;
  justificativa?: string | null | undefined;
}

export interface MovimentacaoConstruida {
  equipamentoId: string;
  usuarioId: string;
  statusAnterior: StatusEquipamento;
  statusNovo: StatusEquipamento;
  estadoAnterior: EstadoFisico;
  estadoNovo: EstadoFisico;
  justificativa: string | null;
  versao: 1;
}

/**
 * MovimentacaoFactory (A1-08, C8): valida a transição e constrói uma Movimentacao
 * imutável com `versao = 1`.
 */
export class MovimentacaoFactory {
  private readonly validador = new ValidadorMovimentacao();

  criar(input: CriarMovimentacaoInput): MovimentacaoConstruida {
    const statusNovo = input.statusNovo ?? input.statusAnterior;
    const estadoNovo = input.estadoNovo ?? input.estadoAnterior;
    const justificativaLimpa =
      input.justificativa !== undefined && input.justificativa !== null
        ? input.justificativa.trim()
        : null;

    this.validador.validarOuFalhar(
      {
        statusAnterior: input.statusAnterior,
        statusNovo,
        estadoAnterior: input.estadoAnterior,
        estadoNovo,
        triagemCompleta: input.triagemCompleta,
        justificativa: justificativaLimpa,
      },
      'MOVIMENTACAO_INVALIDA',
    );

    return {
      equipamentoId: input.equipamentoId,
      usuarioId: input.usuarioId,
      statusAnterior: input.statusAnterior,
      statusNovo,
      estadoAnterior: input.estadoAnterior,
      estadoNovo,
      justificativa: justificativaLimpa && justificativaLimpa.length > 0 ? justificativaLimpa : null,
      versao: 1,
    };
  }
}
