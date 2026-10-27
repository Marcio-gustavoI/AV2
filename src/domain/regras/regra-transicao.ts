import { StatusEquipamento } from '../enums.js';
import { ErroRegraDeNegocio } from '../erros.js';

export interface ContextoTransicao {
  statusAnterior: StatusEquipamento;
  statusNovo: StatusEquipamento;
  triagemCompleta: boolean;
}

/**
 * Interface polimórfica de estratégia para transição de status (A1-08, R3, R5).
 * Cada status de destino possui sua própria implementação, evitando if/else gigantes.
 */
export interface RegraTransicao {
  readonly statusDestino: StatusEquipamento;
  readonly statusOrigemEsperado: StatusEquipamento;
  validar(ctx: ContextoTransicao): string | null;
}

abstract class RegraTransicaoBase implements RegraTransicao {
  abstract readonly statusDestino: StatusEquipamento;
  abstract readonly statusOrigemEsperado: StatusEquipamento;

  validar(ctx: ContextoTransicao): string | null {
    if (ctx.statusAnterior !== this.statusOrigemEsperado) {
      return `Transição de status inválida: não é permitido ir de ${ctx.statusAnterior} para ${this.statusDestino} (origem esperada: ${this.statusOrigemEsperado}).`;
    }
    return this.validarPreCondicoesExtras(ctx);
  }

  protected validarPreCondicoesExtras(_ctx: ContextoTransicao): string | null {
    return null;
  }
}

export class RegraRecebido implements RegraTransicao {
  readonly statusDestino = StatusEquipamento.RECEBIDO;
  readonly statusOrigemEsperado = StatusEquipamento.RECEBIDO;

  validar(ctx: ContextoTransicao): string | null {
    return `Transição de status inválida: não é permitido retornar para ${this.statusDestino} a partir de ${ctx.statusAnterior}.`;
  }
}

export class RegraEmTriagem extends RegraTransicaoBase {
  readonly statusDestino = StatusEquipamento.EM_TRIAGEM;
  readonly statusOrigemEsperado = StatusEquipamento.RECEBIDO;
}

export class RegraTriado extends RegraTransicaoBase {
  readonly statusDestino = StatusEquipamento.TRIADO;
  readonly statusOrigemEsperado = StatusEquipamento.EM_TRIAGEM;

  protected override validarPreCondicoesExtras(ctx: ContextoTransicao): string | null {
    if (!ctx.triagemCompleta) {
      return 'Equipamento só pode avançar para TRIADO com triagem completa.';
    }
    return null;
  }
}

/**
 * RegraDesmonte (R3 / A1-14): exige `triagemCompleta = true` e origem `TRIADO`.
 */
export class RegraEmDesmonte extends RegraTransicaoBase {
  readonly statusDestino = StatusEquipamento.EM_DESMONTE;
  readonly statusOrigemEsperado = StatusEquipamento.TRIADO;

  protected override validarPreCondicoesExtras(ctx: ContextoTransicao): string | null {
    if (!ctx.triagemCompleta) {
      return 'Equipamento só pode entrar em desmonte após triagem completa.';
    }
    return null;
  }
}

export class RegraDesmontado extends RegraTransicaoBase {
  readonly statusDestino = StatusEquipamento.DESMONTADO;
  readonly statusOrigemEsperado = StatusEquipamento.EM_DESMONTE;

  protected override validarPreCondicoesExtras(ctx: ContextoTransicao): string | null {
    if (!ctx.triagemCompleta) {
      return 'Equipamento só pode ser marcado como desmontado após triagem completa.';
    }
    return null;
  }
}

export class RegraDestinado extends RegraTransicaoBase {
  readonly statusDestino = StatusEquipamento.DESTINADO;
  readonly statusOrigemEsperado = StatusEquipamento.DESMONTADO;

  protected override validarPreCondicoesExtras(ctx: ContextoTransicao): string | null {
    if (!ctx.triagemCompleta) {
      return 'Equipamento só pode ser destinado após triagem completa.';
    }
    return null;
  }
}

const REGRAS_POR_DESTINO: Record<StatusEquipamento, RegraTransicao> = {
  RECEBIDO: new RegraRecebido(),
  EM_TRIAGEM: new RegraEmTriagem(),
  TRIADO: new RegraTriado(),
  EM_DESMONTE: new RegraEmDesmonte(),
  DESMONTADO: new RegraDesmontado(),
  DESTINADO: new RegraDestinado(),
};

export function obterRegraTransicao(destino: StatusEquipamento): RegraTransicao {
  return REGRAS_POR_DESTINO[destino];
}

export function validarTransicaoDeStatus(ctx: ContextoTransicao): string | null {
  // Verificação R3 prioritária quando o destino é EM_DESMONTE ou DESMONTADO sem triagem
  if (
    (ctx.statusNovo === StatusEquipamento.EM_DESMONTE ||
      ctx.statusNovo === StatusEquipamento.DESMONTADO) &&
    !ctx.triagemCompleta
  ) {
    return 'Equipamento só pode ir para desmonte após triagem completa.';
  }

  const regra = obterRegraTransicao(ctx.statusNovo);
  return regra.validar(ctx);
}

export function validarTransicaoOuFalhar(ctx: ContextoTransicao): void {
  const erro = validarTransicaoDeStatus(ctx);
  if (erro !== null) {
    throw new ErroRegraDeNegocio(erro, 'TRANSICAO_STATUS_INVALIDA', [
      { campo: 'statusNovo', mensagem: erro },
    ]);
  }
}
