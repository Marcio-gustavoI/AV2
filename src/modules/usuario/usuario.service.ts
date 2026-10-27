import bcrypt from 'bcryptjs';
import {
  ErroConflito,
  ErroConflitoDeVersao,
  ErroNaoEncontrado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  Papel,
} from '../../domain/index.js';
import {
  type PaginacaoInput,
  type ResultadoPaginado,
  montarResposta,
  normalizarPaginacao,
} from '../../lib/paginacao.js';
import type {
  AuditoriaRepository,
  GerenciadorTransacao,
} from '../auditoria/auditoria.repository.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type { EntidadeUsuario, UsuarioRepository } from './usuario.repository.js';

export interface CriarUsuarioInput {
  email: string;
  senha: string;
  papel: Papel;
  ativo?: boolean | undefined;
}

export interface AtualizarUsuarioInput {
  id: string;
  versao: number;
  email?: string | undefined;
  senha?: string | undefined;
  papel?: Papel | undefined;
  ativo?: boolean | undefined;
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarPoliticaSenha(senha: string): void {
  if (senha.length < 10) {
    throw new ErroRegraDeNegocio(
      'A senha deve possuir no mínimo 10 caracteres.',
      'SENHA_FRACA',
      [{ campo: 'senha', mensagem: 'Mínimo de 10 caracteres exigido (R12).' }],
    );
  }
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
    throw new ErroRegraDeNegocio(
      'A senha deve conter pelo menos uma letra e um número.',
      'SENHA_FRACA',
      [{ campo: 'senha', mensagem: 'A senha deve conter letras e números (R12).' }],
    );
  }
}

export function normalizarEmail(email: string): string {
  const limpo = email.trim().toLowerCase();
  if (!REGEX_EMAIL.test(limpo)) {
    throw new ErroRegraDeNegocio('Formato de e-mail inválido.', 'EMAIL_INVALIDO', [
      { campo: 'email', mensagem: 'Informe um endereço de e-mail válido.' },
    ]);
  }
  return limpo;
}

/**
 * UsuarioService (A1-02, A1-06, A1-09, A2-12, A2-14, R12):
 * - Independente de Fastify e Prisma.
 * - Somente ADMIN gerencia usuários.
 * - Hash bcryptjs, senha >= 10 chars com letras e números, proteção contra auto-desativação
 *   e desativação do último ADMIN ativo, versionamento otimista e auditoria sem expor senhaHash.
 */
export class UsuarioService {
  constructor(
    private readonly usuarioRepo: UsuarioRepository,
    private readonly auditoriaRepo: AuditoriaRepository,
    private readonly transacao: GerenciadorTransacao,
    private readonly bcryptRounds: number = 12,
  ) {}

  private exigirAdmin(ator: AtorOperacao): void {
    if (ator.papel !== Papel.ADMIN) {
      throw new ErroSemPermissao('Apenas ADMIN pode gerenciar contas de usuários.');
    }
  }

  async criar(ator: AtorOperacao, input: CriarUsuarioInput): Promise<EntidadeUsuario> {
    this.exigirAdmin(ator);

    const email = normalizarEmail(input.email);
    validarPoliticaSenha(input.senha);
    const senhaHash = await bcrypt.hash(input.senha, this.bcryptRounds);

    return this.transacao.executar(async (tx) => {
      const existente = await this.usuarioRepo.buscarPorEmail(email, tx);
      if (existente) {
        throw new ErroConflito(`Já existe um usuário cadastrado com o e-mail ${email}.`);
      }

      const criado = await this.usuarioRepo.criar(
        {
          email,
          senhaHash,
          papel: input.papel,
          ativo: input.ativo ?? true,
        },
        tx,
      );

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'CRIAR',
          entidade: 'Usuario',
          entidadeId: criado.id,
          antes: null,
          depois: {
            id: criado.id,
            email: criado.email,
            papel: criado.papel,
            ativo: criado.ativo,
            versao: criado.versao,
          },
        },
        tx,
      );

      return criado;
    });
  }

  async buscarPorId(ator: AtorOperacao, id: string): Promise<EntidadeUsuario> {
    this.exigirAdmin(ator);
    const usuario = await this.usuarioRepo.buscarPorId(id);
    if (!usuario) {
      throw new ErroNaoEncontrado(`Usuário ${id} não encontrado.`);
    }
    return usuario;
  }

  async listar(
    ator: AtorOperacao,
    paginacaoInput: PaginacaoInput,
  ): Promise<ResultadoPaginado<EntidadeUsuario>> {
    this.exigirAdmin(ator);
    const { pagina, tamanhoPagina, skip, take } = normalizarPaginacao(paginacaoInput);
    const { dados, total } = await this.usuarioRepo.listar({ skip, take });
    return montarResposta(dados, total, pagina, tamanhoPagina);
  }

  async atualizar(ator: AtorOperacao, input: AtualizarUsuarioInput): Promise<EntidadeUsuario> {
    this.exigirAdmin(ator);

    const novoEmail = input.email !== undefined ? normalizarEmail(input.email) : undefined;
    let novoSenhaHash: string | undefined;
    if (input.senha !== undefined) {
      validarPoliticaSenha(input.senha);
      novoSenhaHash = await bcrypt.hash(input.senha, this.bcryptRounds);
    }

    if (input.ativo === false && input.id === ator.id) {
      throw new ErroRegraDeNegocio(
        'O administrador não pode desativar a própria conta (R12).',
        'AUTO_DESATIVACAO_PROIBIDA',
      );
    }

    if (input.papel !== undefined && input.papel !== Papel.ADMIN && input.id === ator.id) {
      throw new ErroRegraDeNegocio(
        'O administrador não pode remover o próprio papel de ADMIN (R12).',
        'AUTO_REBAIXAMENTO_PROIBIDO',
      );
    }

    return this.transacao.executar(async (tx) => {
      const existente = await this.usuarioRepo.buscarPorId(input.id, tx);
      if (!existente) {
        throw new ErroNaoEncontrado(`Usuário ${input.id} não encontrado.`);
      }

      if (existente.versao !== input.versao) {
        throw new ErroConflitoDeVersao('Usuario');
      }

      if (novoEmail !== undefined && novoEmail !== existente.email) {
        const porEmail = await this.usuarioRepo.buscarPorEmail(novoEmail, tx);
        if (porEmail && porEmail.id !== input.id) {
          throw new ErroConflito(`Já existe um usuário cadastrado com o e-mail ${novoEmail}.`);
        }
      }

      const vaiDeixarDeSerAdminAtivo =
        existente.papel === Papel.ADMIN &&
        existente.ativo &&
        (input.ativo === false || (input.papel !== undefined && input.papel !== Papel.ADMIN));

      if (vaiDeixarDeSerAdminAtivo) {
        const outrosAdminsAtivos = await this.usuarioRepo.contarAdminsAtivos(input.id, tx);
        if (outrosAdminsAtivos === 0) {
          throw new ErroRegraDeNegocio(
            'Não é permitido desativar ou remover o papel do último ADMIN ativo do sistema (R12).',
            'ULTIMO_ADMIN_ATIVO',
          );
        }
      }

      const atualizado = await this.usuarioRepo.atualizarComVersao(
        {
          id: input.id,
          versao: input.versao,
          email: novoEmail,
          senhaHash: novoSenhaHash,
          papel: input.papel,
          ativo: input.ativo,
        },
        tx,
      );

      if (!atualizado) {
        throw new ErroConflitoDeVersao('Usuario');
      }

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'ATUALIZAR',
          entidade: 'Usuario',
          entidadeId: atualizado.id,
          antes: {
            email: existente.email,
            papel: existente.papel,
            ativo: existente.ativo,
            versao: existente.versao,
          },
          depois: {
            email: atualizado.email,
            papel: atualizado.papel,
            ativo: atualizado.ativo,
            senhaAlterada: novoSenhaHash !== undefined,
            versao: atualizado.versao,
          },
        },
        tx,
      );

      return atualizado;
    });
  }

  /**
   * Provisiona um administrador via CLI (`npm run criar-admin`, C3/A1-09).
   */
  async provisionarAdminInicial(dados: {
    email: string;
    senha: string;
  }): Promise<{ usuario: EntidadeUsuario; criadoAgora: boolean }> {
    const email = normalizarEmail(dados.email);
    validarPoliticaSenha(dados.senha);
    const senhaHash = await bcrypt.hash(dados.senha, this.bcryptRounds);

    return this.transacao.executar(async (tx) => {
      const existente = await this.usuarioRepo.buscarPorEmail(email, tx);
      if (existente) {
        return { usuario: existente, criadoAgora: false };
      }

      const criado = await this.usuarioRepo.criar(
        {
          email,
          senhaHash,
          papel: Papel.ADMIN,
          ativo: true,
        },
        tx,
      );

      await this.auditoriaRepo.registrar(
        {
          usuarioId: criado.id,
          acao: 'PROVISIONAR_ADMIN',
          entidade: 'Usuario',
          entidadeId: criado.id,
          antes: null,
          depois: {
            id: criado.id,
            email: criado.email,
            papel: criado.papel,
            ativo: criado.ativo,
            versao: criado.versao,
          },
        },
        tx,
      );

      return { usuario: criado, criadoAgora: true };
    });
  }
}
