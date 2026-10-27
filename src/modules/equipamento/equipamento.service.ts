import { Decimal } from 'decimal.js';
import {
  type ClassificacaoDestino,
  ErroConflito,
  ErroConflitoDeVersao,
  ErroNaoEncontrado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  type EstadoFisico,
  MovimentacaoFactory,
  Papel,
  StatusEquipamento,
  type TipoEquipamento,
  validarFormatoCodigoBarras,
} from '../../domain/index.js';
import {
  type PaginacaoInput,
  type ResultadoPaginado,
  montarResposta,
  normalizarPaginacao,
} from '../../lib/paginacao.js';
import type {
  AuditoriaRepository,
  GerenciadorTransacao,
} from '../auditoria/auditoria.repository.js';
import type { LoteRepository } from '../lote/lote.repository.js';
import type { MovimentacaoRepository } from '../movimentacao/movimentacao.repository.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type {
  EntidadeEquipamento,
  EntidadeEquipamentoDetalhe,
  EntidadeRastreabilidadeEquipamento,
  EquipamentoRepository,
} from './equipamento.repository.js';

export interface CriarEquipamentoServiceInput {
  loteId: string;
  tipo: TipoEquipamento;
  descricao: string;
  estadoFisico: EstadoFisico;
  valorAquisicao?: string | number | null | undefined;
  codigoBarrasInterno?: string | undefined;
}

export interface RealizarTriagemInput {
  equipamentoId: string;
  versao: number;
  classificacaoDestino: ClassificacaoDestino;
  estadoFisico: EstadoFisico;
  justificativa?: string | null | undefined;
}

export interface ListarEquipamentosServiceInput extends PaginacaoInput {
  status?: StatusEquipamento | undefined;
  estadoFisico?: EstadoFisico | undefined;
  tipo?: TipoEquipamento | undefined;
  loteId?: string | undefined;
  organizacaoId?: string | undefined;
}

const PAPEIS_ESCRITA: readonly Papel[] = [Papel.ADMIN, Papel.GESTOR_ALMOXARIFADO];
const PAPEIS_LEITURA: readonly Papel[] = [
  Papel.ADMIN,
  Papel.OPERADOR_CADASTRO,
  Papel.GESTOR_ALMOXARIFADO,
  Papel.AUDITOR,
];

/**
 * EquipamentoService (A1-04, A1-11, A1-14, A1-15, A2-02, A2-11, A2-13, A2-14, R6, R7, R9, R11):
 * - Independente de Fastify e Prisma.
 * - Gerencia cadastro avulso em lote existente (R6, R11), triagem atômica (R9, R7, R4)
 *   e consulta de rastreabilidade completa sem N+1.
 */
export class EquipamentoService {
  private readonly movimentacaoFactory = new MovimentacaoFactory();

  constructor(
    private readonly equipamentoRepo: EquipamentoRepository,
    private readonly loteRepo: LoteRepository,
    private readonly movimentacaoRepo: MovimentacaoRepository,
    private readonly auditoriaRepo: AuditoriaRepository,
    private readonly transacao: GerenciadorTransacao,
  ) {}

  private verificarPermissaoEscrita(ator: AtorOperacao): void {
    if (!PAPEIS_ESCRITA.includes(ator.papel)) {
      throw new ErroSemPermissao(
        'Apenas ADMIN e GESTOR_ALMOXARIFADO podem cadastrar equipamentos ou realizar triagem.',
      );
    }
  }

  private verificarPermissaoLeitura(ator: AtorOperacao): void {
    if (!PAPEIS_LEITURA.includes(ator.papel)) {
      throw new ErroSemPermissao('Sem permissão para consultar equipamentos.');
    }
  }

  async criar(
    ator: AtorOperacao,
    input: CriarEquipamentoServiceInput,
  ): Promise<EntidadeEquipamento> {
    this.verificarPermissaoEscrita(ator);

    const descricao = input.descricao.trim();
    if (!descricao) {
      throw new ErroRegraDeNegocio('Descrição do equipamento é obrigatória.', 'EQUIPAMENTO_INVALIDO');
    }

    let valorFormatado: string | null = null;
    if (
      input.valorAquisicao !== undefined &&
      input.valorAquisicao !== null &&
      input.valorAquisicao !== ''
    ) {
      let dec: Decimal;
      try {
        dec = new Decimal(input.valorAquisicao);
      } catch {
        throw new ErroRegraDeNegocio('Valor de aquisição inválido.', 'EQUIPAMENTO_INVALIDO');
      }
      if (!dec.isFinite() || dec.isNegative()) {
        throw new ErroRegraDeNegocio(
          'Valor de aquisição não pode ser negativo.',
          'EQUIPAMENTO_INVALIDO',
        );
      }
      valorFormatado = dec.toFixed(2);
    }

    return this.transacao.executar(async (tx) => {
      const lote = await this.loteRepo.buscarPorId(input.loteId, tx);
      if (!lote) {
        throw new ErroNaoEncontrado(`Lote ${input.loteId} não encontrado (R11).`);
      }

      let codigoBarras: string;
      if (input.codigoBarrasInterno !== undefined && input.codigoBarrasInterno.trim() !== '') {
        codigoBarras = input.codigoBarrasInterno.trim().toUpperCase();
        if (!validarFormatoCodigoBarras(codigoBarras)) {
          throw new ErroRegraDeNegocio(
            `Código de barras "${codigoBarras}" inválido (formato esperado: GC-000001).`,
            'CODIGO_BARRAS_INVALIDO',
          );
        }
        const existente = await this.equipamentoRepo.buscarPorCodigoBarras(codigoBarras, tx);
        if (existente) {
          throw new ErroConflito(
            `Já existe um equipamento com o código de barras ${codigoBarras} (R6).`,
          );
        }
      } else {
        codigoBarras = await this.equipamentoRepo.gerarProximoCodigoBarras(tx);
      }

      const criado = await this.equipamentoRepo.criar(
        {
          loteId: input.loteId,
          codigoBarrasInterno: codigoBarras,
          tipo: input.tipo,
          descricao,
          valorAquisicao: valorFormatado,
          estadoFisico: input.estadoFisico,
          status: StatusEquipamento.RECEBIDO,
          triagemCompleta: false,
          classificacaoDestino: null,
        },
        tx,
      );

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'CRIAR',
          entidade: 'Equipamento',
          entidadeId: criado.id,
          antes: null,
          depois: {
            id: criado.id,
            loteId: criado.loteId,
            codigoBarrasInterno: criado.codigoBarrasInterno,
            tipo: criado.tipo,
            estadoFisico: criado.estadoFisico,
            status: criado.status,
            versao: criado.versao,
          },
        },
        tx,
      );

      return criado;
    });
  }

  async realizarTriagem(
    ator: AtorOperacao,
    input: RealizarTriagemInput,
  ): Promise<EntidadeEquipamento> {
    this.verificarPermissaoEscrita(ator);

    return this.transacao.executar(async (tx) => {
      const atual = await this.equipamentoRepo.buscarPorId(input.equipamentoId, tx);
      if (!atual) {
        throw new ErroNaoEncontrado(`Equipamento ${input.equipamentoId} não encontrado.`);
      }

      if (atual.versao !== input.versao) {
        throw new ErroConflitoDeVersao('Equipamento');
      }

      if (atual.status !== StatusEquipamento.EM_TRIAGEM) {
        throw new ErroRegraDeNegocio(
          `A triagem só pode ser concluída quando o equipamento está em EM_TRIAGEM (status atual: ${atual.status}).`,
          'STATUS_INVALIDO_PARA_TRIAGEM',
        );
      }

      const movConstruida = this.movimentacaoFactory.criar({
        equipamentoId: atual.id,
        usuarioId: ator.id,
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.TRIADO,
        estadoAnterior: atual.estadoFisico,
        estadoNovo: input.estadoFisico,
        triagemCompleta: true,
        justificativa: input.justificativa,
      });

      const atualizado = await this.equipamentoRepo.atualizarComVersao(
        {
          id: atual.id,
          versao: input.versao,
          status: StatusEquipamento.TRIADO,
          estadoFisico: input.estadoFisico,
          triagemCompleta: true,
          classificacaoDestino: input.classificacaoDestino,
        },
        tx,
      );

      if (!atualizado) {
        throw new ErroConflitoDeVersao('Equipamento');
      }

      await this.movimentacaoRepo.criar(
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
          acao: 'TRIAGEM',
          entidade: 'Equipamento',
          entidadeId: atualizado.id,
          antes: {
            status: atual.status,
            estadoFisico: atual.estadoFisico,
            triagemCompleta: atual.triagemCompleta,
            classificacaoDestino: atual.classificacaoDestino,
            versao: atual.versao,
          },
          depois: {
            status: atualizado.status,
            estadoFisico: atualizado.estadoFisico,
            triagemCompleta: atualizado.triagemCompleta,
            classificacaoDestino: atualizado.classificacaoDestino,
            versao: atualizado.versao,
          },
        },
        tx,
      );

      return atualizado;
    });
  }

  async buscarPorId(ator: AtorOperacao, id: string): Promise<EntidadeEquipamentoDetalhe> {
    this.verificarPermissaoLeitura(ator);
    const eq = await this.equipamentoRepo.buscarDetalhePorId(id);
    if (!eq) {
      throw new ErroNaoEncontrado(`Equipamento ${id} não encontrado.`);
    }
    return eq;
  }

  async obterRastreabilidade(
    ator: AtorOperacao,
    id: string,
  ): Promise<EntidadeRastreabilidadeEquipamento> {
    this.verificarPermissaoLeitura(ator);
    const rastro = await this.equipamentoRepo.buscarRastreabilidadePorId(id);
    if (!rastro) {
      throw new ErroNaoEncontrado(`Equipamento ${id} não encontrado.`);
    }
    return rastro;
  }

  async listar(
    ator: AtorOperacao,
    input: ListarEquipamentosServiceInput,
  ): Promise<ResultadoPaginado<EntidadeEquipamento>> {
    this.verificarPermissaoLeitura(ator);
    const { pagina, tamanhoPagina, skip, take } = normalizarPaginacao(input);
    const { dados, total } = await this.equipamentoRepo.listar({
      status: input.status,
      estadoFisico: input.estadoFisico,
      tipo: input.tipo,
      loteId: input.loteId,
      organizacaoId: input.organizacaoId,
      skip,
      take,
    });
    return montarResposta(dados, total, pagina, tamanhoPagina);
  }
}
