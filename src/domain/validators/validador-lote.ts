import type { DetalheErro } from '../erros.js';
import type { Relogio } from '../relogio.js';
import { Validador } from './validador.js';

export interface EntradaValidacaoLote {
  dataEntrada: Date | string;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const LIMITE_DIAS_PASSADO = 90;

/**
 * Converte uma data (`Date` ou string `YYYY-MM-DD`/ISO) para o número de dias
 * inteiros desde a época UNIX no calendário do fuso informado.
 * Strings `YYYY-MM-DD` são interpretadas diretamente como data civil naquele calendário.
 */
export function paraDiaCalendario(data: Date | string, timeZone: string): number | null {
  if (typeof data === 'string') {
    const matchDataPura = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.trim());
    if (matchDataPura) {
      const ano = Number(matchDataPura[1]);
      const mes = Number(matchDataPura[2]);
      const dia = Number(matchDataPura[3]);
      const utcDate = new Date(Date.UTC(ano, mes - 1, dia));
      if (
        utcDate.getUTCFullYear() !== ano ||
        utcDate.getUTCMonth() !== mes - 1 ||
        utcDate.getUTCDate() !== dia
      ) {
        return null;
      }
      return Math.floor(utcDate.getTime() / MS_POR_DIA);
    }
  }

  const d = typeof data === 'string' ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) {
    return null;
  }

  // Se for Date com meia-noite exata em UTC (como Date @db.Date ou new Date('YYYY-MM-DD')),
  // preservamos o dia civil UTC se tiver sido passado como data pura. Para instantes reais
  // (como relogio.agora()), extraímos o dia no fuso TZ_NEGOCIO.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const partes = formatter.formatToParts(d);
  const ano = Number(partes.find((p) => p.type === 'year')?.value);
  const mes = Number(partes.find((p) => p.type === 'month')?.value);
  const dia = Number(partes.find((p) => p.type === 'day')?.value);
  if (!ano || !mes || !dia) {
    return null;
  }
  return Math.floor(Date.UTC(ano, mes - 1, dia) / MS_POR_DIA);
}

/**
 * ValidadorLote (R2 / A1-13):
 * - `dataEntrada` não pode ser posterior ao dia atual no fuso `tzNegocio`.
 * - `dataEntrada` não pode ser anterior a 90 dias antes de hoje (exatamente 90 dias é permitido).
 */
export class ValidadorLote extends Validador<EntradaValidacaoLote> {
  constructor(
    private readonly relogio: Relogio,
    private readonly tzNegocio = 'America/Sao_Paulo',
  ) {
    super();
  }

  protected coletarErros(entrada: EntradaValidacaoLote, erros: DetalheErro[]): void {
    const diaHoje = paraDiaCalendario(this.relogio.agora(), this.tzNegocio);
    const diaEntrada = paraDiaCalendario(entrada.dataEntrada, this.tzNegocio);

    if (diaEntrada === null || diaHoje === null) {
      erros.push({
        campo: 'dataEntrada',
        mensagem: 'Data de entrada inválida.',
      });
      return;
    }

    const diferencaDias = diaHoje - diaEntrada;

    if (diferencaDias < 0) {
      erros.push({
        campo: 'dataEntrada',
        mensagem: 'Data de entrada do lote não pode ser futura.',
      });
      return;
    }

    if (diferencaDias > LIMITE_DIAS_PASSADO) {
      erros.push({
        campo: 'dataEntrada',
        mensagem: `Data de entrada do lote não pode ser anterior a ${LIMITE_DIAS_PASSADO} dias.`,
      });
    }
  }
}
