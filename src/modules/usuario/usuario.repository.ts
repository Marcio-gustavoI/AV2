import type { Prisma, PrismaClient } from '@prisma/client';
import { Papel } from '../../domain/index.js';

export interface EntidadeUsuario {
  id: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  versao: number;
  criadoEm: Date;
}

export interface EntidadeUsuarioComHash extends EntidadeUsuario {
  senhaHash: string;
}

export interface CriarUsuarioRepoInput {
  email: string;
  senhaHash: string;
  papel: Papel;
  ativo?: boolean | undefined;
}

export interface AtualizarUsuarioRepoInput {
  id: string;
  versao: number;
  email?: string | undefined;
  senhaHash?: string | undefined;
  papel?: Papel | undefined;
  ativo?: boolean | undefined;
}

export interface UsuarioRepository {
  criar(dados: CriarUsuarioRepoInput, tx?: unknown): Promise<EntidadeUsuario>;
  buscarPorId(id: string, tx?: unknown): Promise<EntidadeUsuario | null>;
  buscarPorEmail(email: string, tx?: unknown): Promise<EntidadeUsuario | null>;
  buscarPorEmailComHash(email: string, tx?: unknown): Promise<EntidadeUsuarioComHash | null>;
  listar(params: {
    skip: number;
    take: number;
  }): Promise<{ dados: EntidadeUsuario[]; total: number }>;
  atualizarComVersao(
    dados: AtualizarUsuarioRepoInput,
    tx?: unknown,
  ): Promise<EntidadeUsuario | null>;
  contarAdminsAtivos(excluirUsuarioId?: string, tx?: unknown): Promise<number>;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

const SELECT_SEM_HASH = {
  id: true,
  email: true,
  papel: true,
  ativo: true,
  versao: true,
  criadoEm: true,
} as const;

function mapearUsuario(row: {
  id: string;
  email: string;
  papel: string;
  ativo: boolean;
  versao: number;
  criadoEm: Date;
}): EntidadeUsuario {
  return {
    id: row.id,
    email: row.email,
    papel: row.papel as Papel,
    ativo: row.ativo,
    versao: row.versao,
    criadoEm: row.criadoEm,
  };
}

export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  private client(tx?: unknown): DbClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prismaClient;
  }

  async criar(dados: CriarUsuarioRepoInput, tx?: unknown): Promise<EntidadeUsuario> {
    const db = this.client(tx);
    const criado = await db.usuario.create({
      data: {
        email: dados.email,
        senhaHash: dados.senhaHash,
        papel: dados.papel,
        ativo: dados.ativo ?? true,
      },
      select: SELECT_SEM_HASH,
    });
    return mapearUsuario(criado);
  }

  async buscarPorId(id: string, tx?: unknown): Promise<EntidadeUsuario | null> {
    const db = this.client(tx);
    const encontrado = await db.usuario.findUnique({
      where: { id },
      select: SELECT_SEM_HASH,
    });
    return encontrado ? mapearUsuario(encontrado) : null;
  }

  async buscarPorEmail(email: string, tx?: unknown): Promise<EntidadeUsuario | null> {
    const db = this.client(tx);
    const encontrado = await db.usuario.findUnique({
      where: { email },
      select: SELECT_SEM_HASH,
    });
    return encontrado ? mapearUsuario(encontrado) : null;
  }

  async buscarPorEmailComHash(
    email: string,
    tx?: unknown,
  ): Promise<EntidadeUsuarioComHash | null> {
    const db = this.client(tx);
    const encontrado = await db.usuario.findUnique({
      where: { email },
      select: {
        ...SELECT_SEM_HASH,
        senhaHash: true,
      },
    });
    if (!encontrado) return null;
    return {
      ...mapearUsuario(encontrado),
      senhaHash: encontrado.senhaHash,
    };
  }

  async listar(params: {
    skip: number;
    take: number;
  }): Promise<{ dados: EntidadeUsuario[]; total: number }> {
    const [linhas, total] = await Promise.all([
      this.prismaClient.usuario.findMany({
        select: SELECT_SEM_HASH,
        orderBy: { criadoEm: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prismaClient.usuario.count(),
    ]);
    return {
      dados: linhas.map(mapearUsuario),
      total,
    };
  }

  async atualizarComVersao(
    dados: AtualizarUsuarioRepoInput,
    tx?: unknown,
  ): Promise<EntidadeUsuario | null> {
    const db = this.client(tx);
    const updateData: Prisma.UsuarioUpdateManyMutationInput = {
      versao: { increment: 1 },
      ...(dados.email !== undefined ? { email: dados.email } : {}),
      ...(dados.senhaHash !== undefined ? { senhaHash: dados.senhaHash } : {}),
      ...(dados.papel !== undefined ? { papel: dados.papel } : {}),
      ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
    };

    const res = await db.usuario.updateMany({
      where: { id: dados.id, versao: dados.versao },
      data: updateData,
    });

    if (res.count === 0) {
      return null;
    }

    const atualizado = await db.usuario.findUnique({
      where: { id: dados.id },
      select: SELECT_SEM_HASH,
    });
    return atualizado ? mapearUsuario(atualizado) : null;
  }

  async contarAdminsAtivos(excluirUsuarioId?: string, tx?: unknown): Promise<number> {
    const db = this.client(tx);
    return db.usuario.count({
      where: {
        papel: Papel.ADMIN,
        ativo: true,
        ...(excluirUsuarioId !== undefined ? { id: { not: excluirUsuarioId } } : {}),
      },
    });
  }
}

export class MemoriaUsuarioRepository implements UsuarioRepository {
  public readonly itens = new Map<string, EntidadeUsuarioComHash>();

  private removerHash(u: EntidadeUsuarioComHash): EntidadeUsuario {
    return {
      id: u.id,
      email: u.email,
      papel: u.papel,
      ativo: u.ativo,
      versao: u.versao,
      criadoEm: u.criadoEm,
    };
  }

  async criar(dados: CriarUsuarioRepoInput): Promise<EntidadeUsuario> {
    const item: EntidadeUsuarioComHash = {
      id: crypto.randomUUID(),
      email: dados.email,
      senhaHash: dados.senhaHash,
      papel: dados.papel,
      ativo: dados.ativo ?? true,
      versao: 1,
      criadoEm: new Date(),
    };
    this.itens.set(item.id, item);
    return this.removerHash(item);
  }

  async buscarPorId(id: string): Promise<EntidadeUsuario | null> {
    const item = this.itens.get(id);
    return item ? this.removerHash(item) : null;
  }

  async buscarPorEmail(email: string): Promise<EntidadeUsuario | null> {
    for (const item of this.itens.values()) {
      if (item.email === email) return this.removerHash(item);
    }
    return null;
  }

  async buscarPorEmailComHash(email: string): Promise<EntidadeUsuarioComHash | null> {
    for (const item of this.itens.values()) {
      if (item.email === email) return { ...item };
    }
    return null;
  }

  async listar(params: {
    skip: number;
    take: number;
  }): Promise<{ dados: EntidadeUsuario[]; total: number }> {
    const todos = Array.from(this.itens.values())
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
      .map((u) => this.removerHash(u));
    return {
      dados: todos.slice(params.skip, params.skip + params.take),
      total: todos.length,
    };
  }

  async atualizarComVersao(dados: AtualizarUsuarioRepoInput): Promise<EntidadeUsuario | null> {
    const atual = this.itens.get(dados.id);
    if (!atual || atual.versao !== dados.versao) {
      return null;
    }
    const atualizado: EntidadeUsuarioComHash = {
      ...atual,
      email: dados.email ?? atual.email,
      senhaHash: dados.senhaHash ?? atual.senhaHash,
      papel: dados.papel ?? atual.papel,
      ativo: dados.ativo ?? atual.ativo,
      versao: atual.versao + 1,
    };
    this.itens.set(dados.id, atualizado);
    return this.removerHash(atualizado);
  }

  async contarAdminsAtivos(excluirUsuarioId?: string): Promise<number> {
    let total = 0;
    for (const item of this.itens.values()) {
      if (item.papel === Papel.ADMIN && item.ativo && item.id !== excluirUsuarioId) {
        total++;
      }
    }
    return total;
  }
}
