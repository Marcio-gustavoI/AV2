import { type DetalheErro, ErroRegraDeNegocio } from '../erros.js';

export interface ResultadoValidacao {
  valido: boolean;
  erros: DetalheErro[];
}

/**
 * Classe abstrata Validador<T> usando Template Method (A1-08).
 * O método `validar(entrada)` coleta erros das regras específicas de cada subclasse.
 */
export abstract class Validador<T> {
  protected abstract coletarErros(entrada: T, erros: DetalheErro[]): void;

  validar(entrada: T): ResultadoValidacao {
    const erros: DetalheErro[] = [];
    this.coletarErros(entrada, erros);
    return {
      valido: erros.length === 0,
      erros,
    };
  }

  validarOuFalhar(entrada: T, codigoErro = 'REGRA_DE_NEGOCIO'): void {
    const resultado = this.validar(entrada);
    if (!resultado.valido) {
      const mensagemPrincipal = resultado.erros.map((e) => e.mensagem).join(' ');
      throw new ErroRegraDeNegocio(mensagemPrincipal, codigoErro, resultado.erros);
    }
  }
}
