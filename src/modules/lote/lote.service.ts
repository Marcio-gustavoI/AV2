import {
  type EquipamentoLoteInput,
  ErroConflito,
  ErroNaoEncontrado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  LoteFactory,
  Papel,
  type Relogio,
  RelogioReal,
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
import type {
  EntidadeEquipamento,
  EquipamentoRepository,
} from '../equipamento/equipamento.repository.js';
import type { OrganizacaoRepository } from '../organizacao/organizacao.repository.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type {
  EntidadeLote,
  EntidadeLoteDetalhe,
  LoteRepository,
} from './lote.repository.js';

export interface CriarLoteServiceInput {
  organizacaoId?: string | undefined;
  orgCodigo?: string | undefined;
  notaFiscal: string;
  transportadora: string;
  dataEntrada: Date | string;
  equipamentos?: EquipamentoLoteInput[] | undefined;
}

export interface ListarLotesServiceInput extends PaginacaoInput {
  organizacaoId?: string | undefined;
}

export interface LoteCriadoComEquipamentos extends EntidadeLote {
  equipamentos: EntidadeEquipamento[];
}

const PAPEIS_ESCRITA: readonly Papel[] = [Papel.ADMIN, Papel.GESTOR_ALMOXARIFADO];
const PAPEIS_LEITURA: readonly Papel[] = [
  Papel.ADMIN,
  Papel.OPERADOR_CADASTRO,
  Papel.GESTOR_ALMOXARIFADO,
  Papel.AUDITOR,
];

/**
 * LoteService (A1-04, A1-11, A1-13, A2-02, A2-13, R2, R6, R7, R11):
 * - Independente de Fastify e Prisma.
 * - Usa `LoteFactory` (que aplica `ValidadorLote` com `Relogio` e fuso `TZ_NEGOCIO`).
 * - Resolve `orgCodigo` ou `organizacaoId` (R11).
 * - Cria lote e N equipamentos em uma única transação atômica com auditoria (R7).
 */
export class LoteService {
  private readonly loteFactory: LoteFactory;

  constructor(
    private readonly loteRepo: LoteRepository,
    private readonly equipamentoRepo: EquipamentoRepository,
    private readonly organizacaoRepo: OrganizacaoRepository,
    private readonly auditoriaRepo: AuditoriaRepository,
    private readonly transacao: GerenciadorTransacao,
    relogio: Relogio = new RelogioReal(),
    tzNegocio: string = 'America/Sao_Paulo',
  ) {
    this.loteFactory = new LoteFactory(relogio, tzNegocio);
  }

  private verificarPermissaoEscrita(ator: AtorOperacao): void {
    if (!PAPEIS_ESCRITA.includes(ator.papel)) {
      throw new ErroSemPermissao(
        'Apenas ADMIN e GESTOR_ALMOXARIFADO podem registrar chegada de lotes.',
      );
    }
  }

  private verificarPermissaoLeitura(ator: AtorOperacao): void {
    if (!PAPEIS_LEITURA.includes(ator.papel)) {
      throw new ErroSemPermissao('Sem permissão para consultar lotes.');
    }
  }

  async criar(
    ator: AtorOperacao,
    input: CriarLoteServiceInput,
  ): Promise<LoteCriadoComEquipamentos> {
    this.verificarPermissaoEscrita(ator);

    if (!input.organizacaoId && !input.orgCodigo) {
      throw new ErroRegraDeNegocio(
        'Informe organizacaoId ou orgCodigo para identificar a organização do lote (R11).',
        'ORGANIZACAO_OBRIGATORIA',
      );
    }

    return this.transacao.executar(async (tx) => {
      let organizacaoId = input.organizacaoId;
      if (organizacaoId) {
        const org = await this.organizacaoRepo.buscarPorId(organizacaoId, tx);
        if (!org) {
          throw new ErroNaoEncontrado(`Organização ${organizacaoId} não encontrada (R11).`);
        }
      } else if (input.orgCodigo) {
        const codigoNormalizado = input.orgCodigo.trim().toUpperCase();
        const org = await this.organizacaoRepo.buscarPorCodigo(codigoNormalizado, tx);
        if (!org) {
          throw new ErroNaoEncontrado(
            `Organização com código "${codigoNormalizado}" não encontrada (R11).`,
          );
        }
        organizacaoId = org.id;
      }

      if (!organizacaoId) {
        throw new ErroNaoEncontrado('Organização não encontrada (R11).');
      }

      // Pré-aloca códigos da sequence na mesma transação para os equipamentos que não enviaram código manual
      const qtdSemCodigoManual = (input.equipamentos ?? []).filter(
        (eq) => !eq.codigoBarrasInterno || eq.codigoBarrasInterno.trim() === '',
      ).length;
      const codigosGerados: string[] = [];
      for (let i = 0; i < qtdSemCodigoManual; i++) {
        codigosGerados.push(await this.equipamentoRepo.gerarProximoCodigoBarras(tx));
      }
      let indiceCodigo = 0;

      // Valida lote + todos os equipamentos via LoteFactory ANTES de persistir qualquer registro
      const construido = this.loteFactory.criar(
        {
          organizacaoId,
          notaFiscal: input.notaFiscal,
          transportadora: input.transportadora,
          dataEntrada: input.dataEntrada,
          equipamentos: input.equipamentos,
        },
        () => {
          const proximo = codigosGerados[indiceCodigo];
          indiceCodigo += 1;
          if (!proximo) {
            throw new ErroRegraDeNegocio('Falha ao gerar código de barras sequencial.');
          }
          return proximo;
        },
      );

      // Verifica unicidade no banco para códigos de barras informados
      for (const eq of construido.equipamentos) {
        const existente = await this.equipamentoRepo.buscarPorCodigoBarras(
          eq.codigoBarrasInterno,
          tx,
        );
        if (existente) {
          throw new ErroConflito(
            `Já existe um equipamento com o código de barras ${eq.codigoBarrasInterno} (R6).`,
          );
        }
      }

      const loteCriado = await this.loteRepo.criar(
        {
          organizacaoId: construido.organizacaoId,
          notaFiscal: construido.notaFiscal,
          transportadora: construido.transportadora,
          dataEntrada: construido.dataEntrada,
        },
        tx,
      );

      const equipamentosCriados: EntidadeEquipamento[] = [];
      for (const eq of construido.equipamentos) {
        const eqCriado = await this.equipamentoRepo.criar(
          {
            loteId: loteCriado.id,
            codigoBarrasInterno: eq.codigoBarrasInterno,
            tipo: eq.tipo,
            descricao: eq.descricao,
            valorAquisicao: eq.valorAquisicao,
            estadoFisico: eq.estadoFisico,
            status: eq.status,
            triagemCompleta: eq.triagemCompleta,
            classificacaoDestino: eq.classificacaoDestino,
          },
          tx,
        );
        equipamentosCriados.push(eqCriado);

        await this.auditoriaRepo.registrar(
          {
            usuarioId: ator.id,
            acao: 'CRIAR',
            entidade: 'Equipamento',
            entidadeId: eqCriado.id,
            antes: null,
            depois: {
              id: eqCriado.id,
              loteId: eqCriado.loteId,
              codigoBarrasInterno: eqCriado.codigoBarrasInterno,
              tipo: eqCriado.tipo,
              estadoFisico: eqCriado.estadoFisico,
              status: eqCriado.status,
              versao: eqCriado.versao,
            },
          },
          tx,
        );
      }

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'CRIAR',
          entidade: 'Lote',
          entidadeId: loteCriado.id,
          antes: null,
          depois: {
            id: loteCriado.id,
            organizacaoId: loteCriado.organizacaoId,
            notaFiscal: loteCriado.notaFiscal,
            transportadora: loteCriado.transportadora,
            dataEntrada: loteCriado.dataEntrada.toISOString(),
            quantidadeEquipamentos: equipamentosCriados.length,
            versao: loteCriado.versao,
          },
        },
        tx,
      );

      return {
        ...loteCriado,
        equipamentos: equipamentosCriados,
      };
    });
  }

  async buscarPorId(ator: AtorOperacao, id: string): Promise<EntidadeLoteDetalhe> {
    this.verificarPermissaoLeitura(ator);
    const lote = await this.loteRepo.buscarDetalhePorId(id);
    if (!lote) {
      throw new ErroNaoEncontrado(`Lote ${id} não encontrado.`);
    }
    return lote;
  }

  async listar(
    ator: AtorOperacao,
    input: ListarLotesServiceInput,
  ): Promise<ResultadoPaginado<EntidadeLote>> {
    this.verificarPermissaoLeitura(ator);
    const { pagina, tamanhoPagina, skip, take } = normalizarPaginacao(input);
    const { dados, total } = await this.loteRepo.listar({
      organizacaoId: input.organizacaoId,
      skip,
      take,
    });
    return montarResposta(dados, total, pagina, tamanhoPagina);
  }
}
