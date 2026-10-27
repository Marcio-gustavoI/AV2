import {
  type EstadoFisico,
  StatusEquipamento,
  type TipoEquipamento,
} from '../enums.js';
import { ErroRegraDeNegocio } from '../erros.js';
import type { Relogio } from '../relogio.js';
import { ValidadorLote } from '../validators/validador-lote.js';

export interface EquipamentoLoteInput {
  tipo: TipoEquipamento;
  descricao: string;
  estadoFisico: EstadoFisico;
  valorAquisicao?: string | number | null | undefined;
  codigoBarrasInterno?: string | undefined;
}

export interface CriarLoteFactoryInput {
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  dataEntrada: Date | string;
  equipamentos?: EquipamentoLoteInput[] | undefined;
}

export interface EquipamentoConstruido {
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  descricao: string;
  estadoFisico: EstadoFisico;
  status: StatusEquipamento;
  triagemCompleta: boolean;
  classificacaoDestino: null;
  valorAquisicao: string | null;
}

export interface LoteConstruido {
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  dataEntrada: Date;
  equipamentos: EquipamentoConstruido[];
}

const REGEX_CODIGO_BARRAS = /^GC-\d{6,}$/;

export function formatarCodigoBarras(sequencial: number): string {
  if (!Number.isInteger(sequencial) || sequencial <= 0) {
    throw new ErroRegraDeNegocio('Número sequencial de código de barras inválido.');
  }
  return `GC-${String(sequencial).padStart(6, '0')}`;
}

export function validarFormatoCodigoBarras(codigo: string): boolean {
  return REGEX_CODIGO_BARRAS.test(codigo);
}

function normalizarDataEntradaParaUtcDate(data: Date | string, tzNegocio: string): Date {
  if (typeof data === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.trim());
    if (m) {
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
  }
  const d = typeof data === 'string' ? new Date(data) : data;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzNegocio,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const partes = formatter.formatToParts(d);
  const ano = Number(partes.find((p) => p.type === 'year')?.value);
  const mes = Number(partes.find((p) => p.type === 'month')?.value);
  const dia = Number(partes.find((p) => p.type === 'day')?.value);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * LoteFactory (A1-08): monta um objeto composto de Lote + Equipamentos válidos,
 * aplicando R2 (janela de dataEntrada) e R6 (código de barras GC-XXXXXX).
 */
export class LoteFactory {
  private readonly validadorLote: ValidadorLote;

  constructor(
    relogio: Relogio,
    private readonly tzNegocio = 'America/Sao_Paulo',
  ) {
    this.validadorLote = new ValidadorLote(relogio, tzNegocio);
  }

  criar(
    input: CriarLoteFactoryInput,
    gerarCodigoBarras: () => string,
  ): LoteConstruido {
    const notaFiscal = input.notaFiscal.trim();
    const transportadora = input.transportadora.trim();

    if (!notaFiscal) {
      throw new ErroRegraDeNegocio('Nota fiscal do lote é obrigatória.', 'LOTE_INVALIDO', [
        { campo: 'notaFiscal', mensagem: 'Nota fiscal não pode ser vazia.' },
      ]);
    }

    if (!transportadora) {
      throw new ErroRegraDeNegocio('Transportadora do lote é obrigatória.', 'LOTE_INVALIDO', [
        { campo: 'transportadora', mensagem: 'Transportadora não pode ser vazia.' },
      ]);
    }

    this.validadorLote.validarOuFalhar({ dataEntrada: input.dataEntrada }, 'DATA_LOTE_INVALIDA');

    const codigosNoLote = new Set<string>();
    const equipamentosInput = input.equipamentos ?? [];

    const equipamentos: EquipamentoConstruido[] = equipamentosInput.map((eq, idx) => {
      const descricao = eq.descricao.trim();
      if (!descricao) {
        throw new ErroRegraDeNegocio(
          `Equipamento na posição ${idx} está sem descrição.`,
          'EQUIPAMENTO_INVALIDO',
          [{ campo: `equipamentos[${idx}].descricao`, mensagem: 'Descrição obrigatória.' }],
        );
      }

      let valorFormatado: string | null = null;
      if (eq.valorAquisicao !== undefined && eq.valorAquisicao !== null && eq.valorAquisicao !== '') {
        const num = Number(eq.valorAquisicao);
        if (Number.isNaN(num) || num < 0) {
          throw new ErroRegraDeNegocio(
            `Equipamento na posição ${idx} possui valor de aquisição inválido.`,
            'EQUIPAMENTO_INVALIDO',
            [
              {
                campo: `equipamentos[${idx}].valorAquisicao`,
                mensagem: 'Valor de aquisição deve ser maior ou igual a zero.',
              },
            ],
          );
        }
        valorFormatado = num.toFixed(2);
      }

      let codigo: string;
      if (eq.codigoBarrasInterno !== undefined && eq.codigoBarrasInterno.trim() !== '') {
        codigo = eq.codigoBarrasInterno.trim().toUpperCase();
        if (!validarFormatoCodigoBarras(codigo)) {
          throw new ErroRegraDeNegocio(
            `Código de barras "${codigo}" fora do padrão esperado (GC-000001).`,
            'CODIGO_BARRAS_INVALIDO',
            [
              {
                campo: `equipamentos[${idx}].codigoBarrasInterno`,
                mensagem: 'Formato esperado: GC- seguido de pelo menos 6 dígitos.',
              },
            ],
          );
        }
      } else {
        codigo = gerarCodigoBarras();
      }

      if (codigosNoLote.has(codigo)) {
        throw new ErroRegraDeNegocio(
          `Código de barras duplicado no mesmo lote: ${codigo}.`,
          'CODIGO_BARRAS_DUPLICADO',
        );
      }
      codigosNoLote.add(codigo);

      return {
        codigoBarrasInterno: codigo,
        tipo: eq.tipo,
        descricao,
        estadoFisico: eq.estadoFisico,
        status: StatusEquipamento.RECEBIDO,
        triagemCompleta: false,
        classificacaoDestino: null,
        valorAquisicao: valorFormatado,
      };
    });

    return {
      organizacaoId: input.organizacaoId,
      notaFiscal,
      transportadora,
      dataEntrada: normalizarDataEntradaParaUtcDate(input.dataEntrada, this.tzNegocio),
      equipamentos,
    };
  }
}
