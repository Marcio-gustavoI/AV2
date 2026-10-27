import bcrypt from 'bcryptjs';
import { ErroNaoAutenticado, Papel } from '../../domain/index.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type { UsuarioRepository } from '../usuario/usuario.repository.js';

export interface AssinadorToken {
  assinar(payload: { sub: string; papel: Papel }): string;
}

export interface ResultadoToken {
  token: string;
  expiraEm: string;
  usuario: {
    id: string;
    email: string;
    papel: Papel;
  };
}

export interface PerfilUsuarioAutenticado {
  id: string;
  email: string;
  papel: Papel;
  permissoes: readonly string[];
}

export const PERMISSOES_POR_PAPEL: Readonly<Record<Papel, readonly string[]>> = {
  [Papel.ADMIN]: [
    'usuarios:leitura',
    'usuarios:escrita',
    'parametros:leitura',
    'parametros:escrita',
    'organizacoes:leitura',
    'organizacoes:escrita',
    'contratos:leitura',
    'contratos:escrita',
    'lotes:leitura',
    'lotes:escrita',
    'equipamentos:leitura',
    'equipamentos:escrita',
    'triagem:escrita',
    'movimentacoes:escrita',
    'rastreabilidade:leitura',
    'relatorios:leitura',
    'auditoria:leitura',
  ],
  [Papel.OPERADOR_CADASTRO]: [
    'organizacoes:leitura',
    'organizacoes:escrita',
    'contratos:leitura',
    'contratos:escrita',
    'lotes:leitura',
    'equipamentos:leitura',
    'rastreabilidade:leitura',
  ],
  [Papel.GESTOR_ALMOXARIFADO]: [
    'organizacoes:leitura',
    'contratos:leitura',
    'lotes:leitura',
    'lotes:escrita',
    'equipamentos:leitura',
    'equipamentos:escrita',
    'triagem:escrita',
    'movimentacoes:escrita',
    'rastreabilidade:leitura',
  ],
  [Papel.AUDITOR]: [
    'organizacoes:leitura',
    'contratos:leitura',
    'lotes:leitura',
    'equipamentos:leitura',
    'rastreabilidade:leitura',
    'relatorios:leitura',
    'auditoria:leitura',
  ],
};

// Hash pré-computado válido para comparação constante quando o e-mail não existe (evita ataque de tempo)
const HASH_FICTICIO_TEMPO_CONSTANTE = bcrypt.hashSync(
  'senha-ficticia-para-protecao-contra-timing-attack-999',
  10,
);

const MENSAGEM_FALHA_LOGIN_IDENTICA = 'E-mail ou senha inválidos.';

/**
 * AuthService (A1-06, A1-07, A1-19, A2-12, R12, C1, C4):
 * - Independente de Fastify e Prisma.
 * - Aplica comparação constante com bcrypt mesmo se o e-mail não existir.
 * - Retorna mensagem idêntica para e-mail inexistente e senha incorreta.
 * - Bloqueia login e renovação de usuários inativos.
 */
export class AuthService {
  constructor(
    private readonly usuarioRepo: UsuarioRepository,
    private readonly assinadorToken: AssinadorToken,
    private readonly expiraEm: string = '30m',
  ) {}

  async login(email: string, senha: string): Promise<ResultadoToken> {
    const emailNormalizado = email.trim().toLowerCase();
    const usuario = await this.usuarioRepo.buscarPorEmailComHash(emailNormalizado);

    if (!usuario) {
      await bcrypt.compare(senha, HASH_FICTICIO_TEMPO_CONSTANTE);
      throw new ErroNaoAutenticado(MENSAGEM_FALHA_LOGIN_IDENTICA);
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaCorreta) {
      throw new ErroNaoAutenticado(MENSAGEM_FALHA_LOGIN_IDENTICA);
    }

    if (!usuario.ativo) {
      throw new ErroNaoAutenticado('Conta de usuário inativa.');
    }

    const token = this.assinadorToken.assinar({
      sub: usuario.id,
      papel: usuario.papel,
    });

    return {
      token,
      expiraEm: this.expiraEm,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        papel: usuario.papel,
      },
    };
  }

  async renovar(ator: AtorOperacao): Promise<ResultadoToken> {
    const usuario = await this.usuarioRepo.buscarPorId(ator.id);
    if (!usuario || !usuario.ativo) {
      throw new ErroNaoAutenticado('Usuário inexistente ou inativo.');
    }

    const token = this.assinadorToken.assinar({
      sub: usuario.id,
      papel: usuario.papel,
    });

    return {
      token,
      expiraEm: this.expiraEm,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        papel: usuario.papel,
      },
    };
  }

  async obterPerfil(ator: AtorOperacao): Promise<PerfilUsuarioAutenticado> {
    const usuario = await this.usuarioRepo.buscarPorId(ator.id);
    if (!usuario || !usuario.ativo) {
      throw new ErroNaoAutenticado('Usuário inexistente ou inativo.');
    }

    return {
      id: usuario.id,
      email: usuario.email,
      papel: usuario.papel,
      permissoes: PERMISSOES_POR_PAPEL[usuario.papel],
    };
  }
}
