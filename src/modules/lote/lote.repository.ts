import type { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import type {
  ClassificacaoDestino,
  EstadoFisico,
  StatusEquipamento,
  TipoEquipamento,
} from '../../domain/index.js';
import type { EntidadeEquipamento } from '../equipamento/equipamento.repository.js';

export interface EntidadeLote {
  id: string;
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  dataEntrada: Date;
  versao: number;
  criadoEm: Date;
}

export interface EntidadeLoteDetalhe extends EntidadeLote {
  organizacao: {
    id: string;
    codigo: string;
    cnpj: string;
    nome: string;
  };
  equipamentos: EntidadeEquipamento[];
}

export interface CriarLoteRepoInput {
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  dataEntrada: Date;
}

export interface FiltroLoteInput {
  organizacaoId?: string | undefined;
  skip: number;
  take: number;
}

export interface LoteRepository {
  criar(dados: CriarLoteRepoInput, tx?: unknown): Promise<EntidadeLote>;
  buscarPorId(id: string, tx?: unknown): Promise<EntidadeLote | null>;
  buscarDetalhePorId(id: string, tx?: unknown): Promise<EntidadeLoteDetalhe | null>;
  listar(filtro: FiltroLoteInput): Promise<{ dados: EntidadeLote[]; total: number }>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

const SELECT_LOTE = {
  id: true,
  organizacaoId: true,
  notaFiscal: true,
  transportadora: true,
  dataEntrada: true,
  versao: true,
  criadoEm: true,
} as const;

export class PrismaLoteRepository implements LoteRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async criar(dados: CriarLoteRepoInput, tx?: unknown): Promise<EntidadeLote> {
    const db = this.client(tx);
    return db.lote.create({
      data: {
        organizacaoId: dados.organizacaoId,
        notaFiscal: dados.notaFiscal,
        transportadora: dados.transportadora,
        dataEntrada: dados.dataEntrada,
      },
      select: SELECT_LOTE,
    });
  }

  async buscarPorId(id: string, tx?: unknown): Promise<EntidadeLote | null> {
    const db = this.client(tx);
    return db.lote.findUnique({
      where: { id },
      select: SELECT_LOTE,
    });
  }

  async buscarDetalhePorId(id: string, tx?: unknown): Promise<EntidadeLoteDetalhe | null> {
    const db = this.client(tx);
    const encontrado = await db.lote.findUnique({
      where: { id },
      select: {
        ...SELECT_LOTE,
        organizacao: {
          select: {
            id: true,
            codigo: true,
            cnpj: true,
            nome: true,
          },
        },
        equipamentos: {
          select: {
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
          },
          orderBy: { criadoEm: 'asc' },
        },
      },
    });
    if (!encontrado) return null;
    return {
      id: encontrado.id,
      organizacaoId: encontrado.organizacaoId,
      notaFiscal: encontrado.notaFiscal,
      transportadora: encontrado.transportadora,
      dataEntrada: encontrado.dataEntrada,
      versao: encontrado.versao,
      criadoEm: encontrado.criadoEm,
      organizacao: encontrado.organizacao,
      equipamentos: encontrado.equipamentos.map((eq) => ({
        id: eq.id,
        loteId: eq.loteId,
        codigoBarrasInterno: eq.codigoBarrasInterno,
        tipo: eq.tipo as TipoEquipamento,
        descricao: eq.descricao,
        valorAquisicao:
          eq.valorAquisicao !== null
            ? new Decimal(eq.valorAquisicao.toString()).toFixed(2)
            : null,
        estadoFisico: eq.estadoFisico as EstadoFisico,
        status: eq.status as StatusEquipamento,
        triagemCompleta: eq.triagemCompleta,
        classificacaoDestino: (eq.classificacaoDestino as ClassificacaoDestino | null) ?? null,
        versao: eq.versao,
        criadoEm: eq.criadoEm,
      })),
    };
  }

  async listar(filtro: FiltroLoteInput): Promise<{ dados: EntidadeLote[]; total: number }> {
    const where: Prisma.LoteWhereInput = {
      ...(filtro.organizacaoId !== undefined ? { organizacaoId: filtro.organizacaoId } : {}),
    };

    const [dados, total] = await Promise.all([
      this.prismaClient.lote.findMany({
        where,
        select: SELECT_LOTE,
        orderBy: { criadoEm: 'desc' },
        skip: filtro.skip,
        take: filtro.take,
      }),
      this.prismaClient.lote.count({ where }),
    ]);

    return { dados, total };
  }
}

export class MemoriaLoteRepository implements LoteRepository {
  public readonly itens = new Map<string, EntidadeLote>();
  public equipamentosRef?: Map<string, EntidadeEquipamento>;

  async criar(dados: CriarLoteRepoInput): Promise<EntidadeLote> {
    const item: EntidadeLote = {
      id: crypto.randomUUID(),
      organizacaoId: dados.organizacaoId,
      notaFiscal: dados.notaFiscal,
      transportadora: dados.transportadora,
      dataEntrada: dados.dataEntrada,
      versao: 1,
      criadoEm: new Date(),
    };
    this.itens.set(item.id, item);
    return { ...item };
  }

  async buscarPorId(id: string): Promise<EntidadeLote | null> {
    const item = this.itens.get(id);
    return item ? { ...item } : null;
  }

  async buscarDetalhePorId(id: string): Promise<EntidadeLoteDetalhe | null> {
    const item = this.itens.get(id);
    if (!item) return null;
    const equipamentos: EntidadeEquipamento[] = [];
    if (this.equipamentosRef) {
      for (const eq of this.equipamentosRef.values()) {
        if (eq.loteId === id) {
          equipamentos.push({ ...eq });
        }
      }
    }
    return {
      ...item,
      organizacao: {
        id: item.organizacaoId,
        codigo: 'ORG-MEM',
        cnpj: '11222333000181',
        nome: 'Org Memória',
      },
      equipamentos,
    };
  }

  async listar(filtro: FiltroLoteInput): Promise<{ dados: EntidadeLote[]; total: number }> {
    const filtrados = Array.from(this.itens.values())
      .filter(
        (item) =>
          filtro.organizacaoId === undefined || item.organizacaoId === filtro.organizacaoId,
      )
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());

    return {
      dados: filtrados.slice(filtro.skip, filtro.skip + filtro.take).map((item) => ({ ...item })),
      total: filtrados.length,
    };
  }
}
