import type { Prisma, PrismaClient } from '@prisma/client';
import type { EstadoFisico, Papel, StatusEquipamento } from '../../domain/index.js';

export interface EntidadeMovimentacao {
  id: string;
  equipamentoId: string;
  statusAnterior: StatusEquipamento;
  statusNovo: StatusEquipamento;
  estadoAnterior: EstadoFisico;
  estadoNovo: EstadoFisico;
  justificativa: string | null;
  usuarioId: string;
  versao: number;
  criadoEm: Date;
}

export interface EntidadeMovimentacaoComUsuario extends EntidadeMovimentacao {
  usuario: {
    id: string;
    email: string;
    papel: Papel;
  };
}

export interface CriarMovimentacaoRepoInput {
  equipamentoId: string;
  statusAnterior: StatusEquipamento;
  statusNovo: StatusEquipamento;
  estadoAnterior: EstadoFisico;
  estadoNovo: EstadoFisico;
  justificativa: string | null;
  usuarioId: string;
  versao?: number | undefined;
}

export interface MovimentacaoRepository {
  criar(dados: CriarMovimentacaoRepoInput, tx?: unknown): Promise<EntidadeMovimentacao>;
  listarPorEquipamento(
    equipamentoId: string,
    tx?: unknown,
  ): Promise<EntidadeMovimentacaoComUsuario[]>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

function mapearMovimentacao(row: {
  id: string;
  equipamentoId: string;
  statusAnterior: string;
  statusNovo: string;
  estadoAnterior: string;
  estadoNovo: string;
  justificativa: string | null;
  usuarioId: string;
  versao: number;
  criadoEm: Date;
}): EntidadeMovimentacao {
  return {
    id: row.id,
    equipamentoId: row.equipamentoId,
    statusAnterior: row.statusAnterior as StatusEquipamento,
    statusNovo: row.statusNovo as StatusEquipamento,
    estadoAnterior: row.estadoAnterior as EstadoFisico,
    estadoNovo: row.estadoNovo as EstadoFisico,
    justificativa: row.justificativa,
    usuarioId: row.usuarioId,
    versao: row.versao,
    criadoEm: row.criadoEm,
  };
}

export class PrismaMovimentacaoRepository implements MovimentacaoRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async criar(dados: CriarMovimentacaoRepoInput, tx?: unknown): Promise<EntidadeMovimentacao> {
    const db = this.client(tx);
    const criado = await db.movimentacao.create({
      data: {
        equipamentoId: dados.equipamentoId,
        statusAnterior: dados.statusAnterior,
        statusNovo: dados.statusNovo,
        estadoAnterior: dados.estadoAnterior,
        estadoNovo: dados.estadoNovo,
        justificativa: dados.justificativa,
        usuarioId: dados.usuarioId,
        versao: dados.versao ?? 1,
      },
    });
    return mapearMovimentacao(criado);
  }

  async listarPorEquipamento(
    equipamentoId: string,
    tx?: unknown,
  ): Promise<EntidadeMovimentacaoComUsuario[]> {
    const db = this.client(tx);
    const linhas = await db.movimentacao.findMany({
      where: { equipamentoId },
      include: {
        usuario: {
          select: {
            id: true,
            email: true,
            papel: true,
          },
        },
      },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
    return linhas.map((row) => ({
      ...mapearMovimentacao(row),
      usuario: {
        id: row.usuario.id,
        email: row.usuario.email,
        papel: row.usuario.papel as Papel,
      },
    }));
  }
}

export class MemoriaMovimentacaoRepository implements MovimentacaoRepository {
  public readonly itens: EntidadeMovimentacao[] = [];

  async criar(dados: CriarMovimentacaoRepoInput): Promise<EntidadeMovimentacao> {
    const item: EntidadeMovimentacao = {
      id: crypto.randomUUID(),
      equipamentoId: dados.equipamentoId,
      statusAnterior: dados.statusAnterior,
      statusNovo: dados.statusNovo,
      estadoAnterior: dados.estadoAnterior,
      estadoNovo: dados.estadoNovo,
      justificativa: dados.justificativa,
      usuarioId: dados.usuarioId,
      versao: 1,
      criadoEm: new Date(),
    };
    this.itens.push(item);
    return { ...item };
  }

  async listarPorEquipamento(equipamentoId: string): Promise<EntidadeMovimentacaoComUsuario[]> {
    return this.itens
      .filter((m) => m.equipamentoId === equipamentoId)
      .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
      .map((m) => ({
        ...m,
        usuario: {
          id: m.usuarioId,
          email: 'usuario-memoria@greencode.local',
          papel: 'GESTOR_ALMOXARIFADO' as Papel,
        },
      }));
  }
}
