export interface PaginacaoInput {
  pagina?: number | undefined;
  tamanhoPagina?: number | undefined;
}

export interface PaginacaoOutput {
  pagina: number;
  tamanhoPagina: number;
  total: number;
  totalPaginas: number;
}

export interface ResultadoPaginado<T> {
  dados: T[];
  paginacao: PaginacaoOutput;
}

export const PAGINA_PADRAO = 1;
export const TAMANHO_PAGINA_PADRAO = 20;
export const TAMANHO_PAGINA_MAXIMO = 100;

export function normalizarPaginacao(input: PaginacaoInput): {
  pagina: number;
  tamanhoPagina: number;
  skip: number;
  take: number;
} {
  const pagina = Math.max(1, input.pagina ?? PAGINA_PADRAO);
  const tamanhoPagina = Math.min(
    TAMANHO_PAGINA_MAXIMO,
    Math.max(1, input.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO),
  );
  const skip = (pagina - 1) * tamanhoPagina;
  return { pagina, tamanhoPagina, skip, take: tamanhoPagina };
}

export function montarResposta<T>(
  dados: T[],
  total: number,
  pagina: number,
  tamanhoPagina: number,
): ResultadoPaginado<T> {
  return {
    dados,
    paginacao: {
      pagina,
      tamanhoPagina,
      total,
      totalPaginas: Math.ceil(total / tamanhoPagina),
    },
  };
}
