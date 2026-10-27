import type { Severidade } from './enums.js';

export interface DetalheErro {
  campo?: string;
  mensagem: string;
}

export abstract class ErroDominio extends Error {
  abstract readonly codigo: string;
  abstract readonly statusHttp: number;
  abstract readonly severidade: Severidade;
  readonly detalhes?: DetalheErro[];

  constructor(mensagem: string, detalhes?: DetalheErro[]) {
    super(mensagem);
    this.name = this.constructor.name;
    if (detalhes !== undefined) {
      this.detalhes = detalhes;
    }
  }
}

export class ErroValidacao extends ErroDominio {
  readonly codigo = 'VALIDACAO_INVALIDA';
  readonly statusHttp = 400;
  readonly severidade: Severidade = 'AVISO';
}

export class ErroNaoAutenticado extends ErroDominio {
  readonly codigo = 'NAO_AUTENTICADO';
  readonly statusHttp = 401;
  readonly severidade: Severidade = 'ERRO';

  constructor(mensagem = 'Token ausente, inválido ou expirado.') {
    super(mensagem);
  }
}

export class ErroSemPermissao extends ErroDominio {
  readonly codigo = 'SEM_PERMISSAO';
  readonly statusHttp = 403;
  readonly severidade: Severidade = 'ERRO';

  constructor(mensagem = 'Acesso negado para o papel do usuário.') {
    super(mensagem);
  }
}

export class ErroNaoEncontrado extends ErroDominio {
  readonly codigo = 'NAO_ENCONTRADO';
  readonly statusHttp = 404;
  readonly severidade: Severidade = 'AVISO';
}

export class ErroConflito extends ErroDominio {
  readonly codigo = 'CONFLITO';
  readonly statusHttp = 409;
  readonly severidade: Severidade = 'AVISO';
}

export class ErroConflitoDeVersao extends ErroDominio {
  readonly codigo = 'CONFLITO_DE_VERSAO';
  readonly statusHttp = 409;
  readonly severidade: Severidade = 'AVISO';

  constructor(mensagem = 'Conflito de versão: o registro foi modificado por outra operação.') {
    super(mensagem);
  }
}

export class ErroRegraDeNegocio extends ErroDominio {
  readonly codigo: string;
  readonly statusHttp = 422;
  readonly severidade: Severidade = 'AVISO';

  constructor(mensagem: string, codigo = 'REGRA_DE_NEGOCIO', detalhes?: DetalheErro[]) {
    super(mensagem, detalhes);
    this.codigo = codigo;
  }
}
