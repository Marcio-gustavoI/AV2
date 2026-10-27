import { describe, expect, it } from 'vitest';
import {
  ErroRegraDeNegocio,
  StatusEquipamento,
  validarTransicaoDeStatus,
  validarTransicaoOuFalhar,
} from '../../../src/domain/index.js';

describe('RegraTransicao polimórfica (R3, R5)', () => {
  it('aceita o fluxo linear completo RECEBIDO -> EM_TRIAGEM -> TRIADO -> EM_DESMONTE -> DESMONTADO -> DESTINADO', () => {
    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.RECEBIDO,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
        triagemCompleta: false,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.TRIADO,
        triagemCompleta: true,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.TRIADO,
        statusNovo: StatusEquipamento.EM_DESMONTE,
        triagemCompleta: true,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_DESMONTE,
        statusNovo: StatusEquipamento.DESMONTADO,
        triagemCompleta: true,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.DESMONTADO,
        statusNovo: StatusEquipamento.DESTINADO,
        triagemCompleta: true,
      }),
    ).toBeNull();
  });

  it('desmonte sem triagem: rejeita EM_DESMONTE e DESMONTADO quando triagemCompleta = false (R3)', () => {
    const erroEmDesmonte = validarTransicaoDeStatus({
      statusAnterior: StatusEquipamento.TRIADO,
      statusNovo: StatusEquipamento.EM_DESMONTE,
      triagemCompleta: false,
    });
    expect(erroEmDesmonte).toContain('triagem completa');

    const erroDesmontado = validarTransicaoDeStatus({
      statusAnterior: StatusEquipamento.EM_DESMONTE,
      statusNovo: StatusEquipamento.DESMONTADO,
      triagemCompleta: false,
    });
    expect(erroDesmontado).toContain('triagem completa');
  });

  it('transição de status inválida: rejeita pular etapa (R5)', () => {
    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.RECEBIDO,
        statusNovo: StatusEquipamento.TRIADO,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.EM_DESMONTE,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.DESTINADO,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.TRIADO,
        statusNovo: StatusEquipamento.DESMONTADO,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_DESMONTE,
        statusNovo: StatusEquipamento.DESTINADO,
        triagemCompleta: true,
      }),
    ).not.toBeNull();
  });

  it('transição de status inválida: rejeita voltar para etapa anterior (R5)', () => {
    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.TRIADO,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_DESMONTE,
        statusNovo: StatusEquipamento.TRIADO,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.DESMONTADO,
        statusNovo: StatusEquipamento.EM_DESMONTE,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(() =>
      validarTransicaoOuFalhar({
        statusAnterior: StatusEquipamento.DESTINADO,
        statusNovo: StatusEquipamento.DESMONTADO,
        triagemCompleta: true,
      }),
    ).toThrow(ErroRegraDeNegocio);
  });

  it('transição de status inválida: rejeita voltar para RECEBIDO (R5)', () => {
    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.RECEBIDO,
        triagemCompleta: false,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.DESTINADO,
        statusNovo: StatusEquipamento.RECEBIDO,
        triagemCompleta: true,
      }),
    ).not.toBeNull();
  });

  it('transição de status inválida: rejeita transição para o próprio status igual (R5)', () => {
    for (const status of [
      StatusEquipamento.RECEBIDO,
      StatusEquipamento.EM_TRIAGEM,
      StatusEquipamento.TRIADO,
      StatusEquipamento.EM_DESMONTE,
      StatusEquipamento.DESMONTADO,
      StatusEquipamento.DESTINADO,
    ]) {
      expect(
        validarTransicaoDeStatus({
          statusAnterior: status,
          statusNovo: status,
          triagemCompleta: true,
        }),
      ).not.toBeNull();
    }
  });
});
