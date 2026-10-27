import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Abstração de unidade de trabalho transacional (UnitOfWork) para que os services
 * executem operações atômicas sem importar Prisma diretamente (A2-02, R7).
 */
export interface GerenciadorTransacao {
  executar<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

export class PrismaGerenciadorTransacao implements GerenciadorTransacao {
  constructor(private readonly prismaClient: PrismaClient) {}

  async executar<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prismaClient.$transaction(async (tx) => fn(tx));
  }
}

export class MemoriaGerenciadorTransacao implements GerenciadorTransacao {
  async executar<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn(undefined);
  }
}

export interface RegistroAuditoria {
  id: string;
  usuarioId: string | null;
  acao: string;
  entidade: string;
  entidadeId: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criadoEm: Date;
}

export interface CriarAuditoriaInput {
  usuarioId?: string | null | undefined;
  acao: string;
  entidade: string;
  entidadeId: string;
  antes?: Record<string, unknown> | null | undefined;
  depois?: Record<string, unknown> | null | undefined;
}

export interface FiltroAuditoriaInput {
  usuarioId?: string | undefined;
  entidade?: string | undefined;
  acao?: string | undefined;
  dataInicio?: Date | undefined;
  dataFim?: Date | undefined;
  skip: number;
  take: number;
}

export interface AuditoriaRepository {
  registrar(dados: CriarAuditoriaInput, tx?: unknown): Promise<RegistroAuditoria>;
  listar(filtro: FiltroAuditoriaInput): Promise<{ dados: RegistroAuditoria[]; total: number }>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

function mapearAuditoriaPrisma(row: {
  id: string;
  usuarioId: string | null;
  acao: string;
  entidade: string;
  entidadeId: string;
  antes: Prisma.JsonValue | null;
  depois: Prisma.JsonValue | null;
  criadoEm: Date;
}): RegistroAuditoria {
  return {
    id: row.id,
    usuarioId: row.usuarioId,
    acao: row.acao,
    entidade: row.entidade,
    entidadeId: row.entidadeId,
    antes:
      row.antes !== null && typeof row.antes === 'object' && !Array.isArray(row.antes)
        ? (row.antes as Record<string, unknown>)
        : null,
    depois:
      row.depois !== null && typeof row.depois === 'object' && !Array.isArray(row.depois)
        ? (row.depois as Record<string, unknown>)
        : null,
    criadoEm: row.criadoEm,
  };
}

export class PrismaAuditoriaRepository implements AuditoriaRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async registrar(dados: CriarAuditoriaInput, tx?: unknown): Promise<RegistroAuditoria> {
    const db = this.client(tx);
    const data: Prisma.AuditoriaUncheckedCreateInput = {
      usuarioId: dados.usuarioId ?? null,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      ...(dados.antes !== undefined && dados.antes !== null
        ? { antes: dados.antes as Prisma.InputJsonValue }
        : {}),
      ...(dados.depois !== undefined && dados.depois !== null
        ? { depois: dados.depois as Prisma.InputJsonValue }
        : {}),
    };
    const criado = await db.auditoria.create({ data });
    return mapearAuditoriaPrisma(criado);
  }

  async listar(
    filtro: FiltroAuditoriaInput,
  ): Promise<{ dados: RegistroAuditoria[]; total: number }> {
    const where: Prisma.AuditoriaWhereInput = {};
    if (filtro.usuarioId !== undefined) where.usuarioId = filtro.usuarioId;
    if (filtro.entidade !== undefined) where.entidade = filtro.entidade;
    if (filtro.acao !== undefined) where.acao = filtro.acao;
    if (filtro.dataInicio !== undefined || filtro.dataFim !== undefined) {
      where.criadoEm = {
        ...(filtro.dataInicio !== undefined ? { gte: filtro.dataInicio } : {}),
        ...(filtro.dataFim !== undefined ? { lte: filtro.dataFim } : {}),
      };
    }

    const [linhas, total] = await Promise.all([
      this.prismaClient.auditoria.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: filtro.skip,
        take: filtro.take,
      }),
      this.prismaClient.auditoria.count({ where }),
    ]);

    return {
      dados: linhas.map(mapearAuditoriaPrisma),
      total,
    };
  }
}

export class MemoriaAuditoriaRepository implements AuditoriaRepository {
  public readonly registros: RegistroAuditoria[] = [];
  public falharAoRegistrar = false;

  async registrar(dados: CriarAuditoriaInput): Promise<RegistroAuditoria> {
    if (this.falharAoRegistrar) {
      throw new Error('Falha injetada ao gravar auditoria');
    }
    const item: RegistroAuditoria = {
      id: crypto.randomUUID(),
      usuarioId: dados.usuarioId ?? null,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      antes: dados.antes ?? null,
      depois: dados.depois ?? null,
      criadoEm: new Date(),
    };
    this.registros.push(item);
    return item;
  }

  async listar(
    filtro: FiltroAuditoriaInput,
  ): Promise<{ dados: RegistroAuditoria[]; total: number }> {
    const filtrados = this.registros
      .filter((r) => {
        if (filtro.usuarioId !== undefined && r.usuarioId !== filtro.usuarioId) return false;
        if (filtro.entidade !== undefined && r.entidade !== filtro.entidade) return false;
        if (filtro.acao !== undefined && r.acao !== filtro.acao) return false;
        if (filtro.dataInicio !== undefined && r.criadoEm < filtro.dataInicio) return false;
        if (filtro.dataFim !== undefined && r.criadoEm > filtro.dataFim) return false;
        return true;
      })
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());

    return {
      dados: filtrados.slice(filtro.skip, filtro.skip + filtro.take),
      total: filtrados.length,
    };
  }
}
