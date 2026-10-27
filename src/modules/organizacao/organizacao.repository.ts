import type { Prisma, PrismaClient } from '@prisma/client';
import type { EntidadeContrato } from '../contrato/contrato.repository.js';

export interface EntidadeOrganizacao {
  id: string;
  codigo: string;
  cnpj: string;
  nome: string;
  versao: number;
  criadoEm: Date;
}

export interface EntidadeOrganizacaoDetalhe extends EntidadeOrganizacao {
  contrato: EntidadeContrato | null;
}

export interface CriarOrganizacaoRepoInput {
  codigo: string;
  cnpj: string;
  nome: string;
}

export interface AtualizarOrganizacaoRepoInput {
  id: string;
  versao: number;
  nome?: string | undefined;
  codigo?: string | undefined;
}

export interface OrganizacaoRepository {
  criar(dados: CriarOrganizacaoRepoInput, tx?: unknown): Promise<EntidadeOrganizacao>;
  buscarPorId(id: string, tx?: unknown): Promise<EntidadeOrganizacaoDetalhe | null>;
  buscarPorCodigo(codigo: string, tx?: unknown): Promise<EntidadeOrganizacao | null>;
  buscarPorCnpj(cnpj: string, tx?: unknown): Promise<EntidadeOrganizacao | null>;
  listar(params: {
    skip: number;
    take: number;
  }): Promise<{ dados: EntidadeOrganizacao[]; total: number }>;
  atualizarComVersao(
    dados: AtualizarOrganizacaoRepoInput,
    tx?: unknown,
  ): Promise<EntidadeOrganizacao | null>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaOrganizacaoRepository implements OrganizacaoRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async criar(dados: CriarOrganizacaoRepoInput, tx?: unknown): Promise<EntidadeOrganizacao> {
    const db = this.client(tx);
    return db.organizacao.create({
      data: {
        codigo: dados.codigo,
        cnpj: dados.cnpj,
        nome: dados.nome,
      },
      select: {
        id: true,
        codigo: true,
        cnpj: true,
        nome: true,
        versao: true,
        criadoEm: true,
      },
    });
  }

  async buscarPorId(id: string, tx?: unknown): Promise<EntidadeOrganizacaoDetalhe | null> {
    const db = this.client(tx);
    const org = await db.organizacao.findUnique({
      where: { id },
      include: {
        contrato: true,
      },
    });
    if (!org) return null;
    return {
      id: org.id,
      codigo: org.codigo,
      cnpj: org.cnpj,
      nome: org.nome,
      versao: org.versao,
      criadoEm: org.criadoEm,
      contrato: org.contrato
        ? {
            id: org.contrato.id,
            organizacaoId: org.contrato.organizacaoId,
            numero: org.contrato.numero,
            clausulas:
              org.contrato.clausulas !== null &&
              typeof org.contrato.clausulas === 'object' &&
              !Array.isArray(org.contrato.clausulas)
                ? (org.contrato.clausulas as Record<string, unknown>)
                : null,
            inicio: org.contrato.inicio,
            fim: org.contrato.fim,
            versao: org.contrato.versao,
          }
        : null,
    };
  }

  async buscarPorCodigo(codigo: string, tx?: unknown): Promise<EntidadeOrganizacao | null> {
    const db = this.client(tx);
    return db.organizacao.findUnique({
      where: { codigo },
      select: {
        id: true,
        codigo: true,
        cnpj: true,
        nome: true,
        versao: true,
        criadoEm: true,
      },
    });
  }

  async buscarPorCnpj(cnpj: string, tx?: unknown): Promise<EntidadeOrganizacao | null> {
    const db = this.client(tx);
    return db.organizacao.findUnique({
      where: { cnpj },
      select: {
        id: true,
        codigo: true,
        cnpj: true,
        nome: true,
        versao: true,
        criadoEm: true,
      },
    });
  }

  async listar(params: {
    skip: number;
    take: number;
  }): Promise<{ dados: EntidadeOrganizacao[]; total: number }> {
    const [dados, total] = await Promise.all([
      this.prismaClient.organizacao.findMany({
        select: {
          id: true,
          codigo: true,
          cnpj: true,
          nome: true,
          versao: true,
          criadoEm: true,
        },
        orderBy: { criadoEm: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prismaClient.organizacao.count(),
    ]);
    return { dados, total };
  }

  async atualizarComVersao(
    dados: AtualizarOrganizacaoRepoInput,
    tx?: unknown,
  ): Promise<EntidadeOrganizacao | null> {
    const db = this.client(tx);
    const updateData: Prisma.OrganizacaoUpdateManyMutationInput = {
      versao: { increment: 1 },
      ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
      ...(dados.codigo !== undefined ? { codigo: dados.codigo } : {}),
    };

    const res = await db.organizacao.updateMany({
      where: { id: dados.id, versao: dados.versao },
      data: updateData,
    });

    if (res.count === 0) {
      return null;
    }

    return db.organizacao.findUnique({
      where: { id: dados.id },
      select: {
        id: true,
        codigo: true,
        cnpj: true,
        nome: true,
        versao: true,
        criadoEm: true,
      },
    });
  }
}

export class MemoriaOrganizacaoRepository implements OrganizacaoRepository {
  public readonly itens = new Map<string, EntidadeOrganizacao>();
  public contratosRef?: Map<string, EntidadeContrato>;

  async criar(dados: CriarOrganizacaoRepoInput): Promise<EntidadeOrganizacao> {
    const item: EntidadeOrganizacao = {
      id: crypto.randomUUID(),
      codigo: dados.codigo,
      cnpj: dados.cnpj,
      nome: dados.nome,
      versao: 1,
      criadoEm: new Date(),
    };
    this.itens.set(item.id, item);
    return { ...item };
  }

  async buscarPorId(id: string): Promise<EntidadeOrganizacaoDetalhe | null> {
    const item = this.itens.get(id);
    if (!item) return null;
    let contrato: EntidadeContrato | null = null;
    if (this.contratosRef) {
      for (const c of this.contratosRef.values()) {
        if (c.organizacaoId === id) {
          contrato = { ...c };
          break;
        }
      }
    }
    return { ...item, contrato };
  }

  async buscarPorCodigo(codigo: string): Promise<EntidadeOrganizacao | null> {
    for (const item of this.itens.values()) {
      if (item.codigo === codigo) return { ...item };
    }
    return null;
  }

  async buscarPorCnpj(cnpj: string): Promise<EntidadeOrganizacao | null> {
    for (const item of this.itens.values()) {
      if (item.cnpj === cnpj) return { ...item };
    }
    return null;
  }

  async listar(params: {
    skip: number;
    take: number;
  }): Promise<{ dados: EntidadeOrganizacao[]; total: number }> {
    const todos = Array.from(this.itens.values()).sort(
      (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
    );
    return {
      dados: todos.slice(params.skip, params.skip + params.take).map((i) => ({ ...i })),
      total: todos.length,
    };
  }

  async atualizarComVersao(
    dados: AtualizarOrganizacaoRepoInput,
  ): Promise<EntidadeOrganizacao | null> {
    const atual = this.itens.get(dados.id);
    if (!atual || atual.versao !== dados.versao) {
      return null;
    }
    const atualizado: EntidadeOrganizacao = {
      ...atual,
      nome: dados.nome ?? atual.nome,
      codigo: dados.codigo ?? atual.codigo,
      versao: atual.versao + 1,
    };
    this.itens.set(dados.id, atualizado);
    return { ...atualizado };
  }
}
