import { describe, expect, it } from 'vitest';
import {
  ErroRegraDeNegocio,
  StatusEquipamento,
  validarTransicaoDeStatus,
  validarTransicaoOuFalhar,
} from '../../../src/domain/index.js';

describe('RegraTransicao polimórfica (R3, R5)', () => {
  it('permite o fluxo linear completo RECEBIDO -> EM_TRIAGEM -> TRIADO -> EM_DESMONTE -> DESMONTADO -> DESTINADO', () => {
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

  it('transição de status inválida: bloqueia pulo de etapas (R5)', () => {
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
  });

  it('transição de status inválida: bloqueia retrocesso de etapas (R5)', () => {
    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.TRIADO,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
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

  it('desmonte sem triagem: bloqueia EM_DESMONTE e DESMONTADO quando triagemCompleta = false (R3)', () => {
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
});
