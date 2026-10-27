import type { Prisma, PrismaClient } from '@prisma/client';

export interface EntidadeContrato {
  id: string;
  organizacaoId: string;
  numero: string;
  clausulas: Record<string, unknown> | null;
  inicio: Date;
  fim: Date | null;
  versao: number;
}

export interface CriarContratoRepoInput {
  organizacaoId: string;
  numero: string;
  clausulas?: Record<string, unknown> | null | undefined;
  inicio: Date;
  fim?: Date | null | undefined;
}

export interface AtualizarContratoRepoInput {
  id: string;
  versao: number;
  numero?: string | undefined;
  clausulas?: Record<string, unknown> | null | undefined;
  inicio?: Date | undefined;
  fim?: Date | null | undefined;
}

export interface ContratoRepository {
  criar(dados: CriarContratoRepoInput, tx?: unknown): Promise<EntidadeContrato>;
  buscarPorOrganizacaoId(organizacaoId: string, tx?: unknown): Promise<EntidadeContrato | null>;
  buscarPorNumero(numero: string, tx?: unknown): Promise<EntidadeContrato | null>;
  atualizarComVersao(
    dados: AtualizarContratoRepoInput,
    tx?: unknown,
  ): Promise<EntidadeContrato | null>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

function mapearContratoPrisma(row: {
  id: string;
  organizacaoId: string;
  numero: string;
  clausulas: Prisma.JsonValue | null;
  inicio: Date;
  fim: Date | null;
  versao: number;
}): EntidadeContrato {
  return {
    id: row.id,
    organizacaoId: row.organizacaoId,
    numero: row.numero,
    clausulas:
      row.clausulas !== null && typeof row.clausulas === 'object' && !Array.isArray(row.clausulas)
        ? (row.clausulas as Record<string, unknown>)
        : null,
    inicio: row.inicio,
    fim: row.fim,
    versao: row.versao,
  };
}

export class PrismaContratoRepository implements ContratoRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async criar(dados: CriarContratoRepoInput, tx?: unknown): Promise<EntidadeContrato> {
    const db = this.client(tx);
    const data: Prisma.ContratoUncheckedCreateInput = {
      organizacaoId: dados.organizacaoId,
      numero: dados.numero,
      inicio: dados.inicio,
      fim: dados.fim ?? null,
      ...(dados.clausulas !== undefined && dados.clausulas !== null
        ? { clausulas: dados.clausulas as Prisma.InputJsonValue }
        : {}),
    };
    const criado = await db.contrato.create({ data });
    return mapearContratoPrisma(criado);
  }

  async buscarPorOrganizacaoId(
    organizacaoId: string,
    tx?: unknown,
  ): Promise<EntidadeContrato | null> {
    const db = this.client(tx);
    const row = await db.contrato.findUnique({ where: { organizacaoId } });
    return row ? mapearContratoPrisma(row) : null;
  }

  async buscarPorNumero(numero: string, tx?: unknown): Promise<EntidadeContrato | null> {
    const db = this.client(tx);
    const row = await db.contrato.findUnique({ where: { numero } });
    return row ? mapearContratoPrisma(row) : null;
  }

  async atualizarComVersao(
    dados: AtualizarContratoRepoInput,
    tx?: unknown,
  ): Promise<EntidadeContrato | null> {
    const db = this.client(tx);
    const updateData: Prisma.ContratoUpdateManyMutationInput = {
      versao: { increment: 1 },
      ...(dados.numero !== undefined ? { numero: dados.numero } : {}),
      ...(dados.inicio !== undefined ? { inicio: dados.inicio } : {}),
      ...(dados.fim !== undefined ? { fim: dados.fim } : {}),
      ...(dados.clausulas !== undefined && dados.clausulas !== null
        ? { clausulas: dados.clausulas as Prisma.InputJsonValue }
        : {}),
    };

    const res = await db.contrato.updateMany({
      where: { id: dados.id, versao: dados.versao },
      data: updateData,
    });

    if (res.count === 0) {
      return null;
    }

    const row = await db.contrato.findUnique({ where: { id: dados.id } });
    return row ? mapearContratoPrisma(row) : null;
  }
}

export class MemoriaContratoRepository implements ContratoRepository {
  public readonly itens = new Map<string, EntidadeContrato>();

  async criar(dados: CriarContratoRepoInput): Promise<EntidadeContrato> {
    const item: EntidadeContrato = {
      id: crypto.randomUUID(),
      organizacaoId: dados.organizacaoId,
      numero: dados.numero,
      clausulas: dados.clausulas ?? null,
      inicio: dados.inicio,
      fim: dados.fim ?? null,
      versao: 1,
    };
    this.itens.set(item.id, item);
    return { ...item };
  }

  async buscarPorOrganizacaoId(organizacaoId: string): Promise<EntidadeContrato | null> {
    for (const item of this.itens.values()) {
      if (item.organizacaoId === organizacaoId) return { ...item };
    }
    return null;
  }

  async buscarPorNumero(numero: string): Promise<EntidadeContrato | null> {
    for (const item of this.itens.values()) {
      if (item.numero === numero) return { ...item };
    }
    return null;
  }

  async atualizarComVersao(dados: AtualizarContratoRepoInput): Promise<EntidadeContrato | null> {
    const atual = this.itens.get(dados.id);
    if (!atual || atual.versao !== dados.versao) {
      return null;
    }
    const atualizado: EntidadeContrato = {
      ...atual,
      numero: dados.numero ?? atual.numero,
      clausulas: dados.clausulas !== undefined ? dados.clausulas : atual.clausulas,
      inicio: dados.inicio ?? atual.inicio,
      fim: dados.fim !== undefined ? dados.fim : atual.fim,
      versao: atual.versao + 1,
    };
    this.itens.set(dados.id, atualizado);
    return { ...atualizado };
  }
}
