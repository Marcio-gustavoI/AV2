import {
  ErroConflito,
  ErroConflitoDeVersao,
  ErroNaoEncontrado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  Papel,
} from '../../domain/index.js';
import type {
  AuditoriaRepository,
  GerenciadorTransacao,
} from '../auditoria/auditoria.repository.js';
import type { OrganizacaoRepository } from '../organizacao/organizacao.repository.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type { ContratoRepository, EntidadeContrato } from './contrato.repository.js';

export interface CriarContratoInput {
  organizacaoId: string;
  numero: string;
  clausulas?: Record<string, unknown> | null | undefined;
  inicio: string | Date;
  fim?: string | Date | null | undefined;
}

export interface AtualizarContratoInput {
  organizacaoId: string;
  versao: number;
  numero?: string | undefined;
  clausulas?: Record<string, unknown> | null | undefined;
  inicio?: string | Date | undefined;
  fim?: string | Date | null | undefined;
}

const PAPEIS_ESCRITA: readonly Papel[] = [Papel.ADMIN, Papel.OPERADOR_CADASTRO];
const PAPEIS_LEITURA: readonly Papel[] = [
  Papel.ADMIN,
  Papel.OPERADOR_CADASTRO,
  Papel.GESTOR_ALMOXARIFADO,
  Papel.AUDITOR,
];

function parsearDataPura(valor: string | Date, nomeCampo: string): Date {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      throw new ErroRegraDeNegocio(`Data inválida em ${nomeCampo}.`, 'DATA_CONTRATO_INVALIDA');
    }
    return valor;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia) {
      return d;
    }
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) {
    throw new ErroRegraDeNegocio(`Data inválida em ${nomeCampo}.`, 'DATA_CONTRATO_INVALIDA');
  }
  return d;
}

/**
 * ContratoService (A1-03, A2-02, A2-06, A2-14):
 * - Gerencia o contrato 0..1 vinculado a uma Organização.
 * - Valida `fim >= inicio`, unicidade de número e de organização, versionamento e auditoria.
 */
export class ContratoService {
  constructor(
    private readonly contratoRepo: ContratoRepository,
    private readonly organizacaoRepo: OrganizacaoRepository,
    private readonly auditoriaRepo: AuditoriaRepository,
    private readonly transacao: GerenciadorTransacao,
  ) {}

  private verificarPermissaoEscrita(ator: AtorOperacao): void {
    if (!PAPEIS_ESCRITA.includes(ator.papel)) {
      throw new ErroSemPermissao(
        'Apenas ADMIN e OPERADOR_CADASTRO podem criar ou alterar contratos.',
      );
    }
  }

  private verificarPermissaoLeitura(ator: AtorOperacao): void {
    if (!PAPEIS_LEITURA.includes(ator.papel)) {
      throw new ErroSemPermissao('Sem permissão para consultar contratos.');
    }
  }

  async criar(ator: AtorOperacao, input: CriarContratoInput): Promise<EntidadeContrato> {
    this.verificarPermissaoEscrita(ator);

    const numero = input.numero.trim().toUpperCase();
    if (!numero) {
      throw new ErroRegraDeNegocio('Número do contrato é obrigatório.', 'CONTRATO_INVALIDO');
    }

    const dataInicio = parsearDataPura(input.inicio, 'inicio');
    const dataFim =
      input.fim !== undefined && input.fim !== null && input.fim !== ''
        ? parsearDataPura(input.fim, 'fim')
        : null;

    if (dataFim !== null && dataFim.getTime() < dataInicio.getTime()) {
      throw new ErroRegraDeNegocio(
        'Data de fim do contrato não pode ser anterior à data de início.',
        'DATA_CONTRATO_INVALIDA',
        [{ campo: 'fim', mensagem: 'fim deve ser maior ou igual a inicio.' }],
      );
    }

    return this.transacao.executar(async (tx) => {
      const org = await this.organizacaoRepo.buscarPorId(input.organizacaoId, tx);
      if (!org) {
        throw new ErroNaoEncontrado(`Organização ${input.organizacaoId} não encontrada.`);
      }

      const [porOrg, porNumero] = await Promise.all([
        this.contratoRepo.buscarPorOrganizacaoId(input.organizacaoId, tx),
        this.contratoRepo.buscarPorNumero(numero, tx),
      ]);

      if (porOrg) {
        throw new ErroConflito('Esta organização já possui um contrato cadastrado.');
      }

      if (porNumero) {
        throw new ErroConflito(`Já existe um contrato cadastrado com o número ${numero}.`);
      }

      const criado = await this.contratoRepo.criar(
        {
          organizacaoId: input.organizacaoId,
          numero,
          clausulas: input.clausulas ?? null,
          inicio: dataInicio,
          fim: dataFim,
        },
        tx,
      );

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'CRIAR',
          entidade: 'Contrato',
          entidadeId: criado.id,
          antes: null,
          depois: {
            id: criado.id,
            organizacaoId: criado.organizacaoId,
            numero: criado.numero,
            inicio: criado.inicio.toISOString(),
            fim: criado.fim ? criado.fim.toISOString() : null,
            versao: criado.versao,
          },
        },
        tx,
      );

      return criado;
    });
  }

  async buscarPorOrganizacao(ator: AtorOperacao, organizacaoId: string): Promise<EntidadeContrato> {
    this.verificarPermissaoLeitura(ator);
    const org = await this.organizacaoRepo.buscarPorId(organizacaoId);
    if (!org) {
      throw new ErroNaoEncontrado(`Organização ${organizacaoId} não encontrada.`);
    }
    const contrato = await this.contratoRepo.buscarPorOrganizacaoId(organizacaoId);
    if (!contrato) {
      throw new ErroNaoEncontrado(
        `Nenhum contrato encontrado para a organização ${organizacaoId}.`,
      );
    }
    return contrato;
  }

  async atualizar(ator: AtorOperacao, input: AtualizarContratoInput): Promise<EntidadeContrato> {
    this.verificarPermissaoEscrita(ator);

    return this.transacao.executar(async (tx) => {
      const existente = await this.contratoRepo.buscarPorOrganizacaoId(input.organizacaoId, tx);
      if (!existente) {
        throw new ErroNaoEncontrado(
          `Nenhum contrato encontrado para a organização ${input.organizacaoId}.`,
        );
      }

      const novoNumero =
        input.numero !== undefined ? input.numero.trim().toUpperCase() : existente.numero;
      if (!novoNumero) {
        throw new ErroRegraDeNegocio('Número do contrato não pode ser vazio.', 'CONTRATO_INVALIDO');
      }

      if (novoNumero !== existente.numero) {
        const conflitoNum = await this.contratoRepo.buscarPorNumero(novoNumero, tx);
        if (conflitoNum && conflitoNum.id !== existente.id) {
          throw new ErroConflito(`Já existe um contrato cadastrado com o número ${novoNumero}.`);
        }
      }

      const novoInicio =
        input.inicio !== undefined ? parsearDataPura(input.inicio, 'inicio') : existente.inicio;
      const novoFim =
        input.fim !== undefined
          ? input.fim === null || input.fim === ''
            ? null
            : parsearDataPura(input.fim, 'fim')
          : existente.fim;

      if (novoFim !== null && novoFim.getTime() < novoInicio.getTime()) {
        throw new ErroRegraDeNegocio(
          'Data de fim do contrato não pode ser anterior à data de início.',
          'DATA_CONTRATO_INVALIDA',
          [{ campo: 'fim', mensagem: 'fim deve ser maior ou igual a inicio.' }],
        );
      }

      const atualizado = await this.contratoRepo.atualizarComVersao(
        {
          id: existente.id,
          versao: input.versao,
          numero: novoNumero,
          clausulas: input.clausulas,
          inicio: novoInicio,
          fim: novoFim,
        },
        tx,
      );

      if (!atualizado) {
        throw new ErroConflitoDeVersao();
      }

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'ATUALIZAR',
          entidade: 'Contrato',
          entidadeId: atualizado.id,
          antes: {
            numero: existente.numero,
            inicio: existente.inicio.toISOString(),
            fim: existente.fim ? existente.fim.toISOString() : null,
            versao: existente.versao,
          },
          depois: {
            numero: atualizado.numero,
            inicio: atualizado.inicio.toISOString(),
            fim: atualizado.fim ? atualizado.fim.toISOString() : null,
            versao: atualizado.versao,
          },
        },
        tx,
      );

      return atualizado;
    });
  }
}
