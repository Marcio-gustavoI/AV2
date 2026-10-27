import type { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import {
  type ClassificacaoDestino,
  type EstadoFisico,
  type Papel,
  StatusEquipamento,
  type TipoEquipamento,
  formatarCodigoBarras,
} from '../../domain/index.js';
import type { EntidadeMovimentacaoComUsuario } from '../movimentacao/movimentacao.repository.js';

export interface EntidadeEquipamento {
  id: string;
  loteId: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  descricao: string;
  valorAquisicao: string | null;
  estadoFisico: EstadoFisico;
  status: StatusEquipamento;
  triagemCompleta: boolean;
  classificacaoDestino: ClassificacaoDestino | null;
  versao: number;
  criadoEm: Date;
}

export interface EntidadeEquipamentoDetalhe extends EntidadeEquipamento {
  lote: {
    id: string;
    organizacaoId: string;
    notaFiscal: string;
    transportadora: string;
    dataEntrada: Date;
    organizacao: {
      id: string;
      codigo: string;
      cnpj: string;
      nome: string;
    };
  };
}

export interface EntidadeRastreabilidadeEquipamento {
  equipamento: EntidadeEquipamento;
  lote: {
    id: string;
    organizacaoId: string;
    notaFiscal: string;
    transportadora: string;
    dataEntrada: Date;
  };
  organizacao: {
    id: string;
    codigo: string;
    cnpj: string;
    nome: string;
  };
  movimentacoes: EntidadeMovimentacaoComUsuario[];
}

export interface CriarEquipamentoRepoInput {
  loteId: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  descricao: string;
  valorAquisicao?: string | null | undefined;
  estadoFisico: EstadoFisico;
  status?: StatusEquipamento | undefined;
  triagemCompleta?: boolean | undefined;
  classificacaoDestino?: ClassificacaoDestino | null | undefined;
}

export interface AtualizarEquipamentoComVersaoInput {
  id: string;
  versao: number;
  status?: StatusEquipamento | undefined;
  estadoFisico?: EstadoFisico | undefined;
  triagemCompleta?: boolean | undefined;
  classificacaoDestino?: ClassificacaoDestino | null | undefined;
}

export interface FiltroEquipamentoInput {
  status?: StatusEquipamento | undefined;
  estadoFisico?: EstadoFisico | undefined;
  tipo?: TipoEquipamento | undefined;
  loteId?: string | undefined;
  organizacaoId?: string | undefined;
  skip: number;
  take: number;
}

export interface EquipamentoRepository {
  gerarProximoCodigoBarras(tx?: unknown): Promise<string>;
  criar(dados: CriarEquipamentoRepoInput, tx?: unknown): Promise<EntidadeEquipamento>;
  buscarPorId(id: string, tx?: unknown): Promise<EntidadeEquipamento | null>;
  buscarDetalhePorId(id: string, tx?: unknown): Promise<EntidadeEquipamentoDetalhe | null>;
  buscarRastreabilidadePorId(
    id: string,
    tx?: unknown,
  ): Promise<EntidadeRastreabilidadeEquipamento | null>;
  buscarPorCodigoBarras(
    codigoBarrasInterno: string,
    tx?: unknown,
  ): Promise<EntidadeEquipamento | null>;
  listar(
    filtro: FiltroEquipamentoInput,
  ): Promise<{ dados: EntidadeEquipamento[]; total: number }>;
  atualizarComVersao(
    dados: AtualizarEquipamentoComVersaoInput,
    tx?: unknown,
  ): Promise<EntidadeEquipamento | null>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

const SELECT_EQUIPAMENTO = {
  id: true,
  loteId: true,
  codigoBarrasInterno: true,
  tipo: true,
  descricao: true,
  valorAquisicao: true,
  estadoFisico: true,
  status: true,
  triagemCompleta: true,
  classificacaoDestino: true,
  versao: true,
  criadoEm: true,
} as const;

function mapearEquipamento(row: {
  id: string;
  loteId: string;
  codigoBarrasInterno: string;
  tipo: string;
  descricao: string;
  valorAquisicao: Prisma.Decimal | null;
  estadoFisico: string;
  status: string;
  triagemCompleta: boolean;
  classificacaoDestino: string | null;
  versao: number;
  criadoEm: Date;
}): EntidadeEquipamento {
  return {
    id: row.id,
    loteId: row.loteId,
    codigoBarrasInterno: row.codigoBarrasInterno,
    tipo: row.tipo as TipoEquipamento,
    descricao: row.descricao,
    valorAquisicao:
      row.valorAquisicao !== null
        ? new Decimal(row.valorAquisicao.toString()).toFixed(2)
        : null,
    estadoFisico: row.estadoFisico as EstadoFisico,
    status: row.status as StatusEquipamento,
    triagemCompleta: row.triagemCompleta,
    classificacaoDestino: (row.classificacaoDestino as ClassificacaoDestino | null) ?? null,
    versao: row.versao,
    criadoEm: row.criadoEm,
  };
}

export class PrismaEquipamentoRepository implements EquipamentoRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async gerarProximoCodigoBarras(tx?: unknown): Promise<string> {
    const db = this.client(tx);
    const linhas = await db.$queryRaw<Array<{ seq: bigint | number }>>`
      SELECT nextval('seq_codigo_barras') AS seq
    `;
    const seq = Number(linhas[0]?.seq ?? 1);
    return formatarCodigoBarras(seq);
  }

  async criar(dados: CriarEquipamentoRepoInput, tx?: unknown): Promise<EntidadeEquipamento> {
    const db = this.client(tx);
    const criado = await db.equipamento.create({
      data: {
        loteId: dados.loteId,
        codigoBarrasInterno: dados.codigoBarrasInterno,
        tipo: dados.tipo,
        descricao: dados.descricao,
        valorAquisicao: dados.valorAquisicao ?? null,
        estadoFisico: dados.estadoFisico,
        status: dados.status ?? StatusEquipamento.RECEBIDO,
        triagemCompleta: dados.triagemCompleta ?? false,
        classificacaoDestino: dados.classificacaoDestino ?? null,
      },
      select: SELECT_EQUIPAMENTO,
    });
    return mapearEquipamento(criado);
  }

  async buscarPorId(id: string, tx?: unknown): Promise<EntidadeEquipamento | null> {
    const db = this.client(tx);
    const encontrado = await db.equipamento.findUnique({
      where: { id },
      select: SELECT_EQUIPAMENTO,
    });
    return encontrado ? mapearEquipamento(encontrado) : null;
  }

  async buscarDetalhePorId(id: string, tx?: unknown): Promise<EntidadeEquipamentoDetalhe | null> {
    const db = this.client(tx);
    const encontrado = await db.equipamento.findUnique({
      where: { id },
      select: {
        ...SELECT_EQUIPAMENTO,
        lote: {
          select: {
            id: true,
            organizacaoId: true,
            notaFiscal: true,
            transportadora: true,
            dataEntrada: true,
            organizacao: {
              select: {
                id: true,
                codigo: true,
                cnpj: true,
                nome: true,
              },
            },
          },
        },
      },
    });
    if (!encontrado) return null;
    return {
      ...mapearEquipamento(encontrado),
      lote: encontrado.lote,
    };
  }

  /**
   * Consulta única com `select`/`include` aninhado (sem N+1, A2-11):
   * equipamento -> lote -> organizacao e movimentacoes (ordenadas cronologicamente) -> usuario.
   */
  async buscarRastreabilidadePorId(
    id: string,
    tx?: unknown,
  ): Promise<EntidadeRastreabilidadeEquipamento | null> {
    const db = this.client(tx);
    const encontrado = await db.equipamento.findUnique({
      where: { id },
      select: {
        ...SELECT_EQUIPAMENTO,
        lote: {
          select: {
            id: true,
            organizacaoId: true,
            notaFiscal: true,
            transportadora: true,
            dataEntrada: true,
            organizacao: {
              select: {
                id: true,
                codigo: true,
                cnpj: true,
                nome: true,
              },
            },
          },
        },
        movimentacoes: {
          orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            equipamentoId: true,
            statusAnterior: true,
            statusNovo: true,
            estadoAnterior: true,
            estadoNovo: true,
            justificativa: true,
            usuarioId: true,
            versao: true,
            criadoEm: true,
            usuario: {
              select: {
                id: true,
                email: true,
                papel: true,
              },
            },
          },
        },
      },
    });

    if (!encontrado) return null;

    return {
      equipamento: mapearEquipamento(encontrado),
      lote: {
        id: encontrado.lote.id,
        organizacaoId: encontrado.lote.organizacaoId,
        notaFiscal: encontrado.lote.notaFiscal,
        transportadora: encontrado.lote.transportadora,
        dataEntrada: encontrado.lote.dataEntrada,
      },
      organizacao: encontrado.lote.organizacao,
      movimentacoes: encontrado.movimentacoes.map((m) => ({
        id: m.id,
        equipamentoId: m.equipamentoId,
        statusAnterior: m.statusAnterior as StatusEquipamento,
        statusNovo: m.statusNovo as StatusEquipamento,
        estadoAnterior: m.estadoAnterior as EstadoFisico,
        estadoNovo: m.estadoNovo as EstadoFisico,
        justificativa: m.justificativa,
        usuarioId: m.usuarioId,
        versao: m.versao,
        criadoEm: m.criadoEm,
        usuario: {
          id: m.usuario.id,
          email: m.usuario.email,
          papel: m.usuario.papel as Papel,
        },
      })),
    };
  }

  async buscarPorCodigoBarras(
    codigoBarrasInterno: string,
    tx?: unknown,
  ): Promise<EntidadeEquipamento | null> {
    const db = this.client(tx);
    const encontrado = await db.equipamento.findUnique({
      where: { codigoBarrasInterno },
      select: SELECT_EQUIPAMENTO,
    });
    return encontrado ? mapearEquipamento(encontrado) : null;
  }

  async listar(
    filtro: FiltroEquipamentoInput,
  ): Promise<{ dados: EntidadeEquipamento[]; total: number }> {
    const where: Prisma.EquipamentoWhereInput = {
      ...(filtro.status !== undefined ? { status: filtro.status } : {}),
      ...(filtro.estadoFisico !== undefined ? { estadoFisico: filtro.estadoFisico } : {}),
      ...(filtro.tipo !== undefined ? { tipo: filtro.tipo } : {}),
      ...(filtro.loteId !== undefined ? { loteId: filtro.loteId } : {}),
      ...(filtro.organizacaoId !== undefined
        ? { lote: { organizacaoId: filtro.organizacaoId } }
        : {}),
    };

    const [linhas, total] = await Promise.all([
      this.prismaClient.equipamento.findMany({
        where,
        select: SELECT_EQUIPAMENTO,
        orderBy: { criadoEm: 'desc' },
        skip: filtro.skip,
        take: filtro.take,
      }),
      this.prismaClient.equipamento.count({ where }),
    ]);

    return {
      dados: linhas.map(mapearEquipamento),
      total,
    };
  }

  async atualizarComVersao(
    dados: AtualizarEquipamentoComVersaoInput,
    tx?: unknown,
  ): Promise<EntidadeEquipamento | null> {
    const db = this.client(tx);
    const updateData: Prisma.EquipamentoUpdateManyMutationInput = {
      versao: { increment: 1 },
      ...(dados.status !== undefined ? { status: dados.status } : {}),
      ...(dados.estadoFisico !== undefined ? { estadoFisico: dados.estadoFisico } : {}),
      ...(dados.triagemCompleta !== undefined ? { triagemCompleta: dados.triagemCompleta } : {}),
      ...(dados.classificacaoDestino !== undefined
        ? { classificacaoDestino: dados.classificacaoDestino }
        : {}),
    };

    const res = await db.equipamento.updateMany({
      where: { id: dados.id, versao: dados.versao },
      data: updateData,
    });

    if (res.count === 0) {
      return null;
    }

    const atualizado = await db.equipamento.findUnique({
      where: { id: dados.id },
      select: SELECT_EQUIPAMENTO,
    });
    return atualizado ? mapearEquipamento(atualizado) : null;
  }
}

export class MemoriaEquipamentoRepository implements EquipamentoRepository {
  public readonly itens = new Map<string, EntidadeEquipamento>();
  public movimentacoesRef?: EntidadeMovimentacaoComUsuario[];
  private sequencial = 0;

  async gerarProximoCodigoBarras(): Promise<string> {
    this.sequencial += 1;
    return formatarCodigoBarras(this.sequencial);
  }

  async criar(dados: CriarEquipamentoRepoInput): Promise<EntidadeEquipamento> {
    const item: EntidadeEquipamento = {
      id: crypto.randomUUID(),
      loteId: dados.loteId,
      codigoBarrasInterno: dados.codigoBarrasInterno,
      tipo: dados.tipo,
      descricao: dados.descricao,
      valorAquisicao:
        dados.valorAquisicao !== undefined && dados.valorAquisicao !== null
          ? new Decimal(dados.valorAquisicao).toFixed(2)
          : null,
      estadoFisico: dados.estadoFisico,
      status: dados.status ?? StatusEquipamento.RECEBIDO,
      triagemCompleta: dados.triagemCompleta ?? false,
      classificacaoDestino: dados.classificacaoDestino ?? null,
      versao: 1,
      criadoEm: new Date(),
    };
    this.itens.set(item.id, item);
    return { ...item };
  }

  async buscarPorId(id: string): Promise<EntidadeEquipamento | null> {
    const item = this.itens.get(id);
    return item ? { ...item } : null;
  }

  async buscarDetalhePorId(id: string): Promise<EntidadeEquipamentoDetalhe | null> {
    const item = this.itens.get(id);
    if (!item) return null;
    return {
      ...item,
      lote: {
        id: item.loteId,
        organizacaoId: '00000000-0000-0000-0000-000000000000',
        notaFiscal: 'NF-MEMORIA',
        transportadora: 'TRANSP-MEMORIA',
        dataEntrada: new Date(),
        organizacao: {
          id: '00000000-0000-0000-0000-000000000000',
          codigo: 'MEM01',
          cnpj: '11222333000181',
          nome: 'Org Memória',
        },
      },
    };
  }

  async buscarRastreabilidadePorId(
    id: string,
  ): Promise<EntidadeRastreabilidadeEquipamento | null> {
    const detalhe = await this.buscarDetalhePorId(id);
    if (!detalhe) return null;
    const movs = (this.movimentacoesRef ?? [])
      .filter((m) => m.equipamentoId === id)
      .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
    return {
      equipamento: {
        id: detalhe.id,
        loteId: detalhe.loteId,
        codigoBarrasInterno: detalhe.codigoBarrasInterno,
        tipo: detalhe.tipo,
        descricao: detalhe.descricao,
        valorAquisicao: detalhe.valorAquisicao,
        estadoFisico: detalhe.estadoFisico,
        status: detalhe.status,
        triagemCompleta: detalhe.triagemCompleta,
        classificacaoDestino: detalhe.classificacaoDestino,
        versao: detalhe.versao,
        criadoEm: detalhe.criadoEm,
      },
      lote: {
        id: detalhe.lote.id,
        organizacaoId: detalhe.lote.organizacaoId,
        notaFiscal: detalhe.lote.notaFiscal,
        transportadora: detalhe.lote.transportadora,
        dataEntrada: detalhe.lote.dataEntrada,
      },
      organizacao: detalhe.lote.organizacao,
      movimentacoes: movs,
    };
  }

  async buscarPorCodigoBarras(codigoBarrasInterno: string): Promise<EntidadeEquipamento | null> {
    for (const item of this.itens.values()) {
      if (item.codigoBarrasInterno === codigoBarrasInterno) return { ...item };
    }
    return null;
  }

  async listar(
    filtro: FiltroEquipamentoInput,
  ): Promise<{ dados: EntidadeEquipamento[]; total: number }> {
    const filtrados = Array.from(this.itens.values())
      .filter((item) => {
        if (filtro.status !== undefined && item.status !== filtro.status) return false;
        if (filtro.estadoFisico !== undefined && item.estadoFisico !== filtro.estadoFisico) {
          return false;
        }
        if (filtro.tipo !== undefined && item.tipo !== filtro.tipo) return false;
        if (filtro.loteId !== undefined && item.loteId !== filtro.loteId) return false;
        return true;
      })
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());

    return {
      dados: filtrados.slice(filtro.skip, filtro.skip + filtro.take).map((item) => ({ ...item })),
      total: filtrados.length,
    };
  }

  async atualizarComVersao(
    dados: AtualizarEquipamentoComVersaoInput,
  ): Promise<EntidadeEquipamento | null> {
    const atual = this.itens.get(dados.id);
    if (!atual || atual.versao !== dados.versao) {
      return null;
    }
    const atualizado: EntidadeEquipamento = {
      ...atual,
      status: dados.status ?? atual.status,
      estadoFisico: dados.estadoFisico ?? atual.estadoFisico,
      triagemCompleta: dados.triagemCompleta ?? atual.triagemCompleta,
      classificacaoDestino:
        dados.classificacaoDestino !== undefined
          ? dados.classificacaoDestino
          : atual.classificacaoDestino,
      versao: atual.versao + 1,
    };
    this.itens.set(dados.id, atualizado);
    return { ...atualizado };
  }
}
