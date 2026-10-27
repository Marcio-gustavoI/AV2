import { Decimal } from 'decimal.js';
import {
  ErroRegraDeNegocio,
  ErroSemPermissao,
  EstadoFisico,
  Papel,
  StatusEquipamento,
  TipoEquipamento,
} from '../../domain/index.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type { ParametroRepository } from '../parametro/parametro.repository.js';
import type {
  FiltroRelatorioInput,
  RelatorioRepository,
} from './relatorio.repository.js';

export interface ConsultarRelatorioInput {
  organizacaoId?: string | undefined;
  dataInicio?: string | Date | undefined;
  dataFim?: string | Date | undefined;
}

export interface RelatorioResumoOutput {
  totalEquipamentos: number;
  porStatus: Record<StatusEquipamento, number>;
  porEstadoFisico: Record<EstadoFisico, number>;
  porOrganizacao: Array<{
    organizacaoId: string;
    codigo: string;
    nome: string;
    quantidade: number;
  }>;
  periodo: {
    dataInicio: string | null;
    dataFim: string | null;
  };
}

export interface ItemFinanceiroEquipamento {
  equipamentoId: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  valorAquisicao: string;
  coeficienteDepreciacao: string;
  valorResidual: string;
  imposto: string;
}

export interface RelatorioFinanceiroOutput {
  totalEquipamentosAvaliados: number;
  equipamentosComValorAquisicao: number;
  equipamentosSemValorAquisicao: number;
  aliquotaImposto: string;
  somaValorAquisicao: string;
  somaValorResidual: string;
  somaImposto: string;
  itens: ItemFinanceiroEquipamento[];
}

const PAPEIS_PERMITIDOS: readonly Papel[] = [Papel.ADMIN, Papel.AUDITOR];

const COEFICIENTES_PADRAO: Readonly<Record<TipoEquipamento, string>> = {
  [TipoEquipamento.DESKTOP]: '0.400000',
  [TipoEquipamento.NOTEBOOK]: '0.350000',
  [TipoEquipamento.MONITOR]: '0.450000',
  [TipoEquipamento.SERVIDOR]: '0.250000',
  [TipoEquipamento.PERIFERICO]: '0.600000',
  [TipoEquipamento.REDE]: '0.300000',
  [TipoEquipamento.OUTRO]: '0.500000',
};

const ALIQUOTA_PADRAO = '0.120000';

function parsearDataFiltro(valor: string | Date, fimDoDia: boolean): Date {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      throw new ErroRegraDeNegocio('Data de filtro inválida.', 'FILTRO_DATA_INVALIDO');
    }
    return valor;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (m) {
    return fimDoDia
      ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999))
      : new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) {
    throw new ErroRegraDeNegocio('Data de filtro inválida.', 'FILTRO_DATA_INVALIDO');
  }
  return d;
}

/**
 * RelatorioService (A1-05, R8):
 * - Resumo operacional por status, estado físico, organização e período.
 * - Relatório financeiro com aritmética `Decimal` e `ROUND_HALF_UP` a 2 casas:
 *   `valorResidual = valorAquisicao * (1 - coeficienteDepreciacao(tipo))`
 *   `imposto = valorResidual * aliquota`
 *   Equipamentos sem `valorAquisicao` ficam fora do total e são contados à parte.
 */
export class RelatorioService {
  constructor(
    private readonly relatorioRepo: RelatorioRepository,
    private readonly parametroRepo: ParametroRepository,
  ) {}

  private exigirPermissao(ator: AtorOperacao): void {
    if (!PAPEIS_PERMITIDOS.includes(ator.papel)) {
      throw new ErroSemPermissao('Apenas ADMIN e AUDITOR podem acessar relatórios.');
    }
  }

  private montarFiltro(input: ConsultarRelatorioInput): FiltroRelatorioInput {
    const dataInicio =
      input.dataInicio !== undefined && input.dataInicio !== ''
        ? parsearDataFiltro(input.dataInicio, false)
        : undefined;
    const dataFim =
      input.dataFim !== undefined && input.dataFim !== ''
        ? parsearDataFiltro(input.dataFim, true)
        : undefined;

    if (dataInicio && dataFim && dataFim.getTime() < dataInicio.getTime()) {
      throw new ErroRegraDeNegocio(
        'A data final do período não pode ser anterior à data inicial.',
        'FILTRO_DATA_INVALIDO',
      );
    }

    return {
      organizacaoId: input.organizacaoId,
      dataInicio,
      dataFim,
    };
  }

  async gerarResumo(
    ator: AtorOperacao,
    input: ConsultarRelatorioInput = {},
  ): Promise<RelatorioResumoOutput> {
    this.exigirPermissao(ator);
    const filtro = this.montarFiltro(input);
    const equipamentos = await this.relatorioRepo.listarEquipamentosParaRelatorio(filtro);

    const porStatus: Record<StatusEquipamento, number> = {
      [StatusEquipamento.RECEBIDO]: 0,
      [StatusEquipamento.EM_TRIAGEM]: 0,
      [StatusEquipamento.TRIADO]: 0,
      [StatusEquipamento.EM_DESMONTE]: 0,
      [StatusEquipamento.DESMONTADO]: 0,
      [StatusEquipamento.DESTINADO]: 0,
    };

    const porEstadoFisico: Record<EstadoFisico, number> = {
      [EstadoFisico.SUCATA]: 0,
      [EstadoFisico.RUIM]: 0,
      [EstadoFisico.REGULAR]: 0,
      [EstadoFisico.BOM]: 0,
      [EstadoFisico.EXCELENTE]: 0,
    };

    const mapaOrg = new Map<
      string,
      { organizacaoId: string; codigo: string; nome: string; quantidade: number }
    >();

    for (const eq of equipamentos) {
      porStatus[eq.status] = (porStatus[eq.status] ?? 0) + 1;
      porEstadoFisico[eq.estadoFisico] = (porEstadoFisico[eq.estadoFisico] ?? 0) + 1;

      const atualOrg = mapaOrg.get(eq.organizacao.id);
      if (atualOrg) {
        atualOrg.quantidade += 1;
      } else {
        mapaOrg.set(eq.organizacao.id, {
          organizacaoId: eq.organizacao.id,
          codigo: eq.organizacao.codigo,
          nome: eq.organizacao.nome,
          quantidade: 1,
        });
      }
    }

    return {
      totalEquipamentos: equipamentos.length,
      porStatus,
      porEstadoFisico,
      porOrganizacao: Array.from(mapaOrg.values()),
      periodo: {
        dataInicio: filtro.dataInicio ? filtro.dataInicio.toISOString() : null,
        dataFim: filtro.dataFim ? filtro.dataFim.toISOString() : null,
      },
    };
  }

  async gerarFinanceiro(
    ator: AtorOperacao,
    input: ConsultarRelatorioInput = {},
  ): Promise<RelatorioFinanceiroOutput> {
    this.exigirPermissao(ator);
    const filtro = this.montarFiltro(input);

    const [equipamentos, parametros] = await Promise.all([
      this.relatorioRepo.listarEquipamentosParaRelatorio(filtro),
      this.parametroRepo.listarTodos(),
    ]);

    const mapaParametros = new Map<string, string>();
    for (const p of parametros) {
      mapaParametros.set(p.chave, p.valor);
    }

    const aliquotaStr = mapaParametros.get('ALIQUOTA_IMPOSTO') ?? ALIQUOTA_PADRAO;
    const aliquota = new Decimal(aliquotaStr);

    let equipamentosComValor = 0;
    let equipamentosSemValor = 0;
    let somaAquisicao = new Decimal(0);
    let somaResidual = new Decimal(0);
    let somaImposto = new Decimal(0);
    const itens: ItemFinanceiroEquipamento[] = [];

    for (const eq of equipamentos) {
      if (eq.valorAquisicao === null) {
        equipamentosSemValor += 1;
        continue;
      }

      equipamentosComValor += 1;
      const chaveCoef = `COEF_DEPRECIACAO_${eq.tipo}`;
      const coefStr = mapaParametros.get(chaveCoef) ?? COEFICIENTES_PADRAO[eq.tipo];
      const coef = new Decimal(coefStr);

      const valorAquisicao = new Decimal(eq.valorAquisicao).toDecimalPlaces(
        2,
        Decimal.ROUND_HALF_UP,
      );
      const fatorResidual = new Decimal(1).minus(coef);
      const valorResidual = valorAquisicao
        .mul(fatorResidual)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const imposto = valorResidual
        .mul(aliquota)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      somaAquisicao = somaAquisicao.plus(valorAquisicao);
      somaResidual = somaResidual.plus(valorResidual);
      somaImposto = somaImposto.plus(imposto);

      itens.push({
        equipamentoId: eq.id,
        codigoBarrasInterno: eq.codigoBarrasInterno,
        tipo: eq.tipo,
        valorAquisicao: valorAquisicao.toFixed(2),
        coeficienteDepreciacao: coef.toFixed(6),
        valorResidual: valorResidual.toFixed(2),
        imposto: imposto.toFixed(2),
      });
    }

    return {
      totalEquipamentosAvaliados: equipamentos.length,
      equipamentosComValorAquisicao: equipamentosComValor,
      equipamentosSemValorAquisicao: equipamentosSemValor,
      aliquotaImposto: aliquota.toFixed(6),
      somaValorAquisicao: somaAquisicao.toFixed(2),
      somaValorResidual: somaResidual.toFixed(2),
      somaImposto: somaImposto.toFixed(2),
      itens,
    };
  }
}
