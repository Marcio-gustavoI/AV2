import {
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
import type { AtorOperacao } from '../organizacao/organizacao.service.js';
import type {
  AuditoriaRepository,
  FiltroAuditoriaInput,
  RegistroAuditoria,
} from './auditoria.repository.js';

export interface ConsultarAuditoriaInput extends PaginacaoInput {
  usuarioId?: string | undefined;
  entidade?: string | undefined;
  acao?: string | undefined;
  dataInicio?: string | Date | undefined;
  dataFim?: string | Date | undefined;
}

const PAPEIS_PERMITIDOS: readonly Papel[] = [Papel.ADMIN, Papel.AUDITOR];

function parsearDataFiltro(valor: string | Date, fimDoDia: boolean): Date {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      throw new ErroRegraDeNegocio('Data de filtro inválida.', 'FILTRO_DATA_INVALIDO');
    }
    return valor;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (m) {
    return fimDoDia
      ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999))
      : new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) {
    throw new ErroRegraDeNegocio('Data de filtro inválida.', 'FILTRO_DATA_INVALIDO');
  }
  return d;
}

/**
 * AuditoriaService (A1-05, A1-16, A1-24):
 * - Consulta paginada ao journal imutável com filtros por usuário, entidade, ação e intervalo de datas.
 * - Acesso exclusivo para ADMIN e AUDITOR.
 */
export class AuditoriaService {
  constructor(private readonly auditoriaRepo: AuditoriaRepository) {}

  async listar(
    ator: AtorOperacao,
    input: ConsultarAuditoriaInput,
  ): Promise<ResultadoPaginado<RegistroAuditoria>> {
    if (!PAPEIS_PERMITIDOS.includes(ator.papel)) {
      throw new ErroSemPermissao('Apenas ADMIN e AUDITOR podem consultar a trilha de auditoria.');
    }

    const { pagina, tamanhoPagina, skip, take } = normalizarPaginacao(input);

    const dataInicio =
      input.dataInicio !== undefined && input.dataInicio !== ''
        ? parsearDataFiltro(input.dataInicio, false)
        : undefined;
    const dataFim =
      input.dataFim !== undefined && input.dataFim !== ''
        ? parsearDataFiltro(input.dataFim, true)
        : undefined;

    if (dataInicio && dataFim && dataFim.getTime() < dataInicio.getTime()) {
      throw new ErroRegraDeNegocio(
        'A data final do filtro não pode ser anterior à data inicial.',
        'FILTRO_DATA_INVALIDO',
      );
    }

    const filtro: FiltroAuditoriaInput = {
      usuarioId: input.usuarioId,
      entidade: input.entidade,
      acao: input.acao,
      dataInicio,
      dataFim,
      skip,
      take,
    };

    const { dados, total } = await this.auditoriaRepo.listar(filtro);
    return montarResposta(dados, total, pagina, tamanhoPagina);
  }
}
