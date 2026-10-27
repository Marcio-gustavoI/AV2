import type { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface EntidadeParametro {
  chave: string;
  valor: string; // Representação decimal exata (ex.: "0.150000")
  versao: number;
  atualizadoEm: Date;
}

export interface UpsertParametroRepoInput {
  chave: string;
  valor: string;
  versaoEsperada?: number | undefined;
}

export interface ParametroRepository {
  listarTodos(tx?: unknown): Promise<EntidadeParametro[]>;
  buscarPorChave(chave: string, tx?: unknown): Promise<EntidadeParametro | null>;
  criar(chave: string, valor: string, tx?: unknown): Promise<EntidadeParametro>;
  atualizarComVersao(
    chave: string,
    valor: string,
    versao: number,
    tx?: unknown,
  ): Promise<EntidadeParametro | null>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

function mapearParametro(row: {
  chave: string;
  valor: Prisma.Decimal;
  versao: number;
  atualizadoEm: Date;
}): EntidadeParametro {
  return {
    chave: row.chave,
    valor: new Decimal(row.valor.toString()).toFixed(6),
    versao: row.versao,
    atualizadoEm: row.atualizadoEm,
  };
}

export class PrismaParametroRepository implements ParametroRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async listarTodos(tx?: unknown): Promise<EntidadeParametro[]> {
    const db = this.client(tx);
    const linhas = await db.parametro.findMany({
      orderBy: { chave: 'asc' },
    });
    return linhas.map(mapearParametro);
  }

  async buscarPorChave(chave: string, tx?: unknown): Promise<EntidadeParametro | null> {
    const db = this.client(tx);
    const encontrado = await db.parametro.findUnique({
      where: { chave },
    });
    return encontrado ? mapearParametro(encontrado) : null;
  }

  async criar(chave: string, valor: string, tx?: unknown): Promise<EntidadeParametro> {
    const db = this.client(tx);
    const criado = await db.parametro.create({
      data: {
        chave,
        valor,
        versao: 1,
      },
    });
    return mapearParametro(criado);
  }

  async atualizarComVersao(
    chave: string,
    valor: string,
    versao: number,
    tx?: unknown,
  ): Promise<EntidadeParametro | null> {
    const db = this.client(tx);
    const res = await db.parametro.updateMany({
      where: { chave, versao },
      data: {
        valor,
        versao: { increment: 1 },
        atualizadoEm: new Date(),
      },
    });
    if (res.count === 0) {
      return null;
    }
    const atualizado = await db.parametro.findUnique({ where: { chave } });
    return atualizado ? mapearParametro(atualizado) : null;
  }
}

export class MemoriaParametroRepository implements ParametroRepository {
  public readonly itens = new Map<string, EntidadeParametro>();

  async listarTodos(): Promise<EntidadeParametro[]> {
    return Array.from(this.itens.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((item) => ({ ...item }));
  }

  async buscarPorChave(chave: string): Promise<EntidadeParametro | null> {
    const item = this.itens.get(chave);
    return item ? { ...item } : null;
  }

  async criar(chave: string, valor: string): Promise<EntidadeParametro> {
    const novo: EntidadeParametro = {
      chave,
      valor: new Decimal(valor).toFixed(6),
      versao: 1,
      atualizadoEm: new Date(),
    };
    this.itens.set(chave, novo);
    return { ...novo };
  }

  async atualizarComVersao(
    chave: string,
    valor: string,
    versao: number,
  ): Promise<EntidadeParametro | null> {
    const atual = this.itens.get(chave);
    if (!atual || atual.versao !== versao) {
      return null;
    }
    const atualizado: EntidadeParametro = {
      chave,
      valor: new Decimal(valor).toFixed(6),
      versao: atual.versao + 1,
      atualizadoEm: new Date(),
    };
    this.itens.set(chave, atualizado);
    return { ...atualizado };
  }
}
