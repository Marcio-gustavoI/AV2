import {
  ErroConflitoDeVersao,
  ErroNaoEncontrado,
  ErroSemPermissao,
  type EstadoFisico,
  MovimentacaoFactory,
  Papel,
  type StatusEquipamento,
} from '../../domain/index.js';
import type {
  AuditoriaRepository,
  GerenciadorTransacao,
} from '../auditoria/auditoria.repository.js';
import type {
  EntidadeEquipamento,
  EquipamentoRepository,
} from '../equipamento/equipamento.repository.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type {
  EntidadeMovimentacao,
  MovimentacaoRepository,
} from './movimentacao.repository.js';

export interface RegistrarMovimentacaoInput {
  equipamentoId: string;
  versao: number;
  statusNovo?: StatusEquipamento | undefined;
  estadoNovo?: EstadoFisico | undefined;
  justificativa?: string | null | undefined;
}

export interface ResultadoMovimentacaoRegistrada {
  equipamento: EntidadeEquipamento;
  movimentacao: EntidadeMovimentacao;
}

const PAPEIS_ESCRITA: readonly Papel[] = [Papel.ADMIN, Papel.GESTOR_ALMOXARIFADO];

/**
 * MovimentacaoService (A1-04, A1-11, A1-14, A1-15, A1-24, A2-02, A2-13, A2-14, R3, R4, R5, R7, R10):
 * - Independente de Fastify e Prisma.
 * - Usa `MovimentacaoFactory` + `ValidadorMovimentacao` + polimorfismo `RegraTransicao`.
 * - Grava atomicamente (na mesma `$transaction`) a atualização versionada do equipamento,
 *   a `Movimentacao` imutável e a `Auditoria`.
 */
export class MovimentacaoService {
  private readonly movimentacaoFactory = new MovimentacaoFactory();

  constructor(
    private readonly equipamentoRepo: EquipamentoRepository,
    private readonly movimentacaoRepo: MovimentacaoRepository,
    private readonly auditoriaRepo: AuditoriaRepository,
    private readonly transacao: GerenciadorTransacao,
  ) {}

  private verificarPermissaoEscrita(ator: AtorOperacao): void {
    if (!PAPEIS_ESCRITA.includes(ator.papel)) {
      throw new ErroSemPermissao(
        'Apenas ADMIN e GESTOR_ALMOXARIFADO podem registrar movimentações de equipamentos.',
      );
    }
  }

  async registrar(
    ator: AtorOperacao,
    input: RegistrarMovimentacaoInput,
  ): Promise<ResultadoMovimentacaoRegistrada> {
    this.verificarPermissaoEscrita(ator);

    return this.transacao.executar(async (tx) => {
      const atual = await this.equipamentoRepo.buscarPorId(input.equipamentoId, tx);
      if (!atual) {
        throw new ErroNaoEncontrado(`Equipamento ${input.equipamentoId} não encontrado.`);
      }

      if (atual.versao !== input.versao) {
        throw new ErroConflitoDeVersao('Equipamento');
      }

      const movConstruida = this.movimentacaoFactory.criar({
        equipamentoId: atual.id,
        usuarioId: ator.id,
        statusAnterior: atual.status,
        statusNovo: input.statusNovo,
        estadoAnterior: atual.estadoFisico,
        estadoNovo: input.estadoNovo,
        triagemCompleta: atual.triagemCompleta,
        justificativa: input.justificativa,
      });

      const equipamentoAtualizado = await this.equipamentoRepo.atualizarComVersao(
        {
          id: atual.id,
          versao: input.versao,
          status: movConstruida.statusNovo,
          estadoFisico: movConstruida.estadoNovo,
        },
        tx,
      );

      if (!equipamentoAtualizado) {
        throw new ErroConflitoDeVersao('Equipamento');
      }

      const movimentacaoCriada = await this.movimentacaoRepo.criar(
        {
          equipamentoId: movConstruida.equipamentoId,
          statusAnterior: movConstruida.statusAnterior,
          statusNovo: movConstruida.statusNovo,
          estadoAnterior: movConstruida.estadoAnterior,
          estadoNovo: movConstruida.estadoNovo,
          justificativa: movConstruida.justificativa,
          usuarioId: movConstruida.usuarioId,
          versao: 1,
        },
        tx,
      );

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'MOVIMENTAR',
          entidade: 'Equipamento',
          entidadeId: equipamentoAtualizado.id,
          antes: {
            status: atual.status,
            estadoFisico: atual.estadoFisico,
            versao: atual.versao,
          },
          depois: {
            status: equipamentoAtualizado.status,
            estadoFisico: equipamentoAtualizado.estadoFisico,
            justificativa: movConstruida.justificativa,
            movimentacaoId: movimentacaoCriada.id,
            versao: equipamentoAtualizado.versao,
          },
        },
        tx,
      );

      return {
        equipamento: equipamentoAtualizado,
        movimentacao: movimentacaoCriada,
      };
    });
  }
}
