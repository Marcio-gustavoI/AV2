import { Decimal } from 'decimal.js';
import {
  ErroConflitoDeVersao,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  Papel,
} from '../../domain/index.js';
import type {
  AuditoriaRepository,
  GerenciadorTransacao,
} from '../auditoria/auditoria.repository.js';
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type { EntidadeParametro, ParametroRepository } from './parametro.repository.js';

export interface DefinirParametroInput {
  chave: string;
  valor: string | number;
  versao?: number | undefined;
}

function normalizarChave(chave: string): string {
  const limpa = chave.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,100}$/.test(limpa)) {
    throw new ErroRegraDeNegocio(
      `Chave de parâmetro inválida: "${chave}". Use apenas letras maiúsculas, números e underscore.`,
      'PARAMETRO_INVALIDO',
    );
  }
  return limpa;
}

function normalizarValorDecimal(valor: string | number): string {
  let dec: Decimal;
  try {
    dec = new Decimal(valor);
  } catch {
    throw new ErroRegraDeNegocio('Valor de parâmetro deve ser numérico decimal.', 'PARAMETRO_INVALIDO');
  }
  if (!dec.isFinite() || dec.isNegative()) {
    throw new ErroRegraDeNegocio(
      'Valor do parâmetro não pode ser negativo (deve ser >= 0).',
      'PARAMETRO_INVALIDO',
    );
  }
  return dec.toFixed(6);
}

/**
 * ParametroService (A1-02, R8):
 * - Exclusivo para ADMIN na escrita/leitura administrativa via `/api/v1/parametros`.
 * - Garante `valor >= 0` usando `Decimal`, versionamento otimista e auditoria transacional.
 */
export class ParametroService {
  constructor(
    private readonly parametroRepo: ParametroRepository,
    private readonly auditoriaRepo: AuditoriaRepository,
    private readonly transacao: GerenciadorTransacao,
  ) {}

  private exigirAdmin(ator: AtorOperacao): void {
    if (ator.papel !== Papel.ADMIN) {
      throw new ErroSemPermissao('Apenas ADMIN pode consultar ou alterar parâmetros globais.');
    }
  }

  async listar(ator: AtorOperacao): Promise<EntidadeParametro[]> {
    this.exigirAdmin(ator);
    return this.parametroRepo.listarTodos();
  }

  async definir(ator: AtorOperacao, input: DefinirParametroInput): Promise<EntidadeParametro> {
    this.exigirAdmin(ator);
    const chave = normalizarChave(input.chave);
    const valorNormalizado = normalizarValorDecimal(input.valor);

    return this.transacao.executar(async (tx) => {
      const existente = await this.parametroRepo.buscarPorChave(chave, tx);

      if (!existente) {
        const criado = await this.parametroRepo.criar(chave, valorNormalizado, tx);
        await this.auditoriaRepo.registrar(
          {
            usuarioId: ator.id,
            acao: 'CRIAR',
            entidade: 'Parametro',
            entidadeId: criado.chave,
            antes: null,
            depois: {
              chave: criado.chave,
              valor: criado.valor,
              versao: criado.versao,
            },
          },
          tx,
        );
        return criado;
      }

      const versaoParaUsar = input.versao ?? existente.versao;
      if (existente.versao !== versaoParaUsar) {
        throw new ErroConflitoDeVersao('Parametro');
      }

      const atualizado = await this.parametroRepo.atualizarComVersao(
        chave,
        valorNormalizado,
        versaoParaUsar,
        tx,
      );

      if (!atualizado) {
        throw new ErroConflitoDeVersao('Parametro');
      }

      await this.auditoriaRepo.registrar(
        {
          usuarioId: ator.id,
          acao: 'ATUALIZAR',
          entidade: 'Parametro',
          entidadeId: atualizado.chave,
          antes: {
            chave: existente.chave,
            valor: existente.valor,
            versao: existente.versao,
          },
          depois: {
            chave: atualizado.chave,
            valor: atualizado.valor,
            versao: atualizado.versao,
          },
        },
        tx,
      );

      return atualizado;
    });
  }

  async definirLote(
    ator: AtorOperacao,
    itens: readonly DefinirParametroInput[],
  ): Promise<EntidadeParametro[]> {
    this.exigirAdmin(ator);
    if (itens.length === 0) {
      throw new ErroRegraDeNegocio(
        'Informe ao menos um parâmetro para atualização.',
        'PARAMETRO_INVALIDO',
      );
    }

    const resultados: EntidadeParametro[] = [];
    for (const item of itens) {
      const res = await this.definir(ator, item);
      resultados.push(res);
    }
    return resultados;
  }
}
