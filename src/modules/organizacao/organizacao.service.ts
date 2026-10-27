import {
  ErroConflito,
  ErroConflitoDeVersao,
  ErroNaoEncontrado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  Papel,
  ValidadorCnpj,
  normalizarCnpj,
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
import type {
  EntidadeOrganizacao,
  EntidadeOrganizacaoDetalhe,
  OrganizacaoRepository,
} from './organizacao.repository.js';

export interface AtorOperacao {
  id: string;
  papel: Papel;
}

export interface CriarOrganizacaoInput {
  codigo: string;
  cnpj: string;
  nome: string;
}

export interface AtualizarOrganizacaoInput {
  id: string;
  versao: number;
  nome?: string | undefined;
  codigo?: string | undefined;
}

const PAPEIS_ESCRITA: readonly Papel[] = [Papel.ADMIN, Papel.OPERADOR_CADASTRO];
const PAPEIS_LEITURA: readonly Papel[] = [
  Papel.ADMIN,
  Papel.OPERADOR_CADASTRO,
  Papel.GESTOR_ALMOXARIFADO,
  Papel.AUDITOR,
];

/**
 * OrganizacaoService (A1-03, A1-12, A2-02, R1):
 * - Independente de Fastify e Prisma.
 * - Aplica autorização em defesa em profundidade, normalização e validação de CNPJ,
 *   unicidade de CNPJ e código, versionamento otimista e auditoria transacional.
 */
export class OrganizacaoService {
  private readonly validadorCnpj = new ValidadorCnpj();

  constructor(
    private readonly organizacaoRepo: OrganizacaoRepository,
    private readonly auditoriaRepo: AuditoriaRepository,
    private readonly transacao: GerenciadorTransacao,
  ) {}

  private verificarPermissaoEscrita(ator: AtorOperacao): void {
    if (!PAPEIS_ESCRITA.includes(ator.papel)) {
      throw new ErroSemPermissao(
        'Apenas ADMIN e OPERADOR_CADASTRO podem criar ou alterar organizações.',
      );
    }
  }

  private verificarPermissaoLeitura(ator: AtorOperacao): void {
    if (!PAPEIS_LEITURA.includes(ator.papel)) {
      throw new ErroSemPermissao('Sem permissão para consultar organizações.');
    }
  }

  async criar(ator: AtorOperacao, input: CriarOrganizacaoInput): Promise<EntidadeOrganizacao> {
    this.verificarPermissaoEscrita(ator);

    const codigo = input.codigo.trim().toUpperCase();
    const nome = input.nome.trim();
    const cnpjNormalizado = normalizarCnpj(input.cnpj);

    if (!codigo) {
      throw new ErroRegraDeNegocio('Código da organização é obrigatório.', 'ORGANIZACAO_INVALIDA');
    }
    if (!nome) {
      throw new ErroRegraDeNegocio('Nome da organização é obrigatório.', 'ORGANIZACAO_INVALIDA');
    }

    this.validadorCnpj.validarOuFalhar(cnpjNormalizado, 'CNPJ_INVALIDO');

    return this.transacao.executar(async (tx) => {
      const [porCnpj, porCodigo] = await Promise.all([
        this.organizacaoRepo.buscarPorCnpj(cnpjNormalizado, tx),
        this.organizacaoRepo.buscarPorCodigo(codigo, tx),
      ]);

      if (porCnpj) {
        throw new ErroConflito(`Já existe uma organização cadastrada com o CNPJ ${cnpjNormalizado}.`);
      }

      if (porCodigo) {
        throw new ErroConflito(`Já existe uma organização cadastrada com o código ${codigo}.`);
      }

      const criada = await this.organizacaoRepo.criar(
        {
          codigo,
          cnpj: cnpjNormalizado,
          nome,
        },
        tx,
      );

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'CRIAR',
          entidade: 'Organizacao',
          entidadeId: criada.id,
          antes: null,
          depois: {
            id: criada.id,
            codigo: criada.codigo,
            cnpj: criada.cnpj,
            nome: criada.nome,
            versao: criada.versao,
          },
        },
        tx,
      );

      return criada;
    });
  }

  async buscarPorId(ator: AtorOperacao, id: string): Promise<EntidadeOrganizacaoDetalhe> {
    this.verificarPermissaoLeitura(ator);
    const org = await this.organizacaoRepo.buscarPorId(id);
    if (!org) {
      throw new ErroNaoEncontrado(`Organização ${id} não encontrada.`);
    }
    return org;
  }

  async listar(
    ator: AtorOperacao,
    paginacaoInput: PaginacaoInput,
  ): Promise<ResultadoPaginado<EntidadeOrganizacao>> {
    this.verificarPermissaoLeitura(ator);
    const { pagina, tamanhoPagina, skip, take } = normalizarPaginacao(paginacaoInput);
    const { dados, total } = await this.organizacaoRepo.listar({ skip, take });
    return montarResposta(dados, total, pagina, tamanhoPagina);
  }

  async atualizar(
    ator: AtorOperacao,
    input: AtualizarOrganizacaoInput,
  ): Promise<EntidadeOrganizacao> {
    this.verificarPermissaoEscrita(ator);

    const nome = input.nome !== undefined ? input.nome.trim() : undefined;
    const codigo = input.codigo !== undefined ? input.codigo.trim().toUpperCase() : undefined;

    if (nome !== undefined && nome === '') {
      throw new ErroRegraDeNegocio('Nome da organização não pode ser vazio.', 'ORGANIZACAO_INVALIDA');
    }
    if (codigo !== undefined && codigo === '') {
      throw new ErroRegraDeNegocio('Código da organização não pode ser vazio.', 'ORGANIZACAO_INVALIDA');
    }

    return this.transacao.executar(async (tx) => {
      const existente = await this.organizacaoRepo.buscarPorId(input.id, tx);
      if (!existente) {
        throw new ErroNaoEncontrado(`Organização ${input.id} não encontrada.`);
      }

      if (codigo !== undefined && codigo !== existente.codigo) {
        const conflitoCodigo = await this.organizacaoRepo.buscarPorCodigo(codigo, tx);
        if (conflitoCodigo && conflitoCodigo.id !== input.id) {
          throw new ErroConflito(`Já existe uma organização cadastrada com o código ${codigo}.`);
        }
      }

      const atualizada = await this.organizacaoRepo.atualizarComVersao(
        {
          id: input.id,
          versao: input.versao,
          nome,
          codigo,
        },
        tx,
      );

      if (!atualizada) {
        throw new ErroConflitoDeVersao();
      }

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'ATUALIZAR',
          entidade: 'Organizacao',
          entidadeId: atualizada.id,
          antes: {
            codigo: existente.codigo,
            nome: existente.nome,
            versao: existente.versao,
          },
          depois: {
            codigo: atualizada.codigo,
            nome: atualizada.nome,
            versao: atualizada.versao,
          },
        },
        tx,
      );

      return atualizada;
    });
  }
}
