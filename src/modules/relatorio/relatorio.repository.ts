import type { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import type {
  EstadoFisico,
  StatusEquipamento,
  TipoEquipamento,
} from '../../domain/index.js';

export interface FiltroRelatorioInput {
  organizacaoId?: string | undefined;
  dataInicio?: Date | undefined;
  dataFim?: Date | undefined;
}

export interface EquipamentoParaRelatorio {
  id: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  descricao: string;
  valorAquisicao: string | null;
  estadoFisico: EstadoFisico;
  status: StatusEquipamento;
  criadoEm: Date;
  organizacao: {
    id: string;
    codigo: string;
    nome: string;
  };
}

export interface RelatorioRepository {
  listarEquipamentosParaRelatorio(
    filtro: FiltroRelatorioInput,
  ): Promise<EquipamentoParaRelatorio[]>;
}

export class PrismaRelatorioRepository implements RelatorioRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  async listarEquipamentosParaRelatorio(
    filtro: FiltroRelatorioInput,
  ): Promise<EquipamentoParaRelatorio[]> {
    const where: Prisma.EquipamentoWhereInput = {
      ...(filtro.organizacaoId !== undefined
        ? { lote: { organizacaoId: filtro.organizacaoId } }
        : {}),
      ...(filtro.dataInicio !== undefined || filtro.dataFim !== undefined
        ? {
            criadoEm: {
              ...(filtro.dataInicio !== undefined ? { gte: filtro.dataInicio } : {}),
              ...(filtro.dataFim !== undefined ? { lte: filtro.dataFim } : {}),
            },
          }
        : {}),
    };

    const linhas = await this.prismaClient.equipamento.findMany({
      where,
      select: {
        id: true,
        codigoBarrasInterno: true,
        tipo: true,
        descricao: true,
        valorAquisicao: true,
        estadoFisico: true,
        status: true,
        criadoEm: true,
        lote: {
          select: {
            organizacao: {
              select: {
                id: true,
                codigo: true,
                nome: true,
              },
            },
          },
        },
      },
      orderBy: { criadoEm: 'asc' },
    });

    return linhas.map((row) => ({
      id: row.id,
      codigoBarrasInterno: row.codigoBarrasInterno,
      tipo: row.tipo as TipoEquipamento,
      descricao: row.descricao,
      valorAquisicao:
        row.valorAquisicao !== null
          ? new Decimal(row.valorAquisicao.toString()).toFixed(2)
          : null,
      estadoFisico: row.estadoFisico as EstadoFisico,
      status: row.status as StatusEquipamento,
      criadoEm: row.criadoEm,
      organizacao: row.lote.organizacao,
    }));
  }
}

export class MemoriaRelatorioRepository implements RelatorioRepository {
  public itens: EquipamentoParaRelatorio[] = [];

  async listarEquipamentosParaRelatorio(
    filtro: FiltroRelatorioInput,
  ): Promise<EquipamentoParaRelatorio[]> {
    return this.itens.filter((item) => {
      if (filtro.organizacaoId !== undefined && item.organizacao.id !== filtro.organizacaoId) {
        return false;
      }
      if (filtro.dataInicio !== undefined && item.criadoEm < filtro.dataInicio) {
        return false;
      }
      if (filtro.dataFim !== undefined && item.criadoEm > filtro.dataFim) {
        return false;
      }
      return true;
    });
  }
}
