import { describe, expect, it } from 'vitest';
import {
  ErroRegraDeNegocio,
  EstadoFisico,
  StatusEquipamento,
  ValidadorMovimentacao,
} from '../../../src/domain/index.js';

describe('ValidadorMovimentacao (R3, R4, R5, R10)', () => {
  const validadorMov = new ValidadorMovimentacao();

  it('queda de 1 nível sem justificativa (aceita): permite queda de 1 nível sem justificativa (R4)', () => {
    const quedaUmNivel = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.RECEBIDO,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(quedaUmNivel.valido).toBe(true);
  });

  it('queda de 2 níveis sem justificativa (422): rejeita quando justificativa está ausente ou vazia (R4)', () => {
    const semJust = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.REGULAR,
      triagemCompleta: false,
      justificativa: '',
    });
    expect(semJust.valido).toBe(false);
    expect(semJust.erros[0]?.campo).toBe('justificativa');

    expect(() =>
      validadorMov.validarOuFalhar({
        statusAnterior: StatusEquipamento.RECEBIDO,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
        estadoAnterior: EstadoFisico.EXCELENTE,
        estadoNovo: EstadoFisico.REGULAR,
        triagemCompleta: false,
      }),
    ).toThrow(ErroRegraDeNegocio);
  });

  it('rejeita justificativa curta (< 10 caracteres) quando há queda de 2 níveis (R4)', () => {
    const justCurta = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.RUIM,
      triagemCompleta: false,
      justificativa: 'curta123',
    });
    expect(justCurta.valido).toBe(false);
    expect(justCurta.erros[0]?.campo).toBe('justificativa');
  });

  it('aceita queda de 2 níveis quando justificativa válida (>= 10 caracteres) é informada (R4)', () => {
    const comJustValida = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.REGULAR,
      triagemCompleta: false,
      justificativa: 'Placa-mãe oxidada e tela quebrada no transporte.',
    });
    expect(comJustValida.valido).toBe(true);
  });

  it('exige justificativa válida também para queda de 3 ou 4 níveis (EXCELENTE -> RUIM e EXCELENTE -> SUCATA) (R4)', () => {
    const queda3SemJust = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.RUIM,
      triagemCompleta: false,
    });
    expect(queda3SemJust.valido).toBe(false);

    const queda4SemJust = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.SUCATA,
      triagemCompleta: false,
    });
    expect(queda4SemJust.valido).toBe(false);

    const queda4ComJust = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.SUCATA,
      triagemCompleta: false,
      justificativa: 'Dano estrutural irreversível constatado na abertura.',
    });
    expect(queda4ComJust.valido).toBe(true);
  });

  it('aceita melhora de estado físico sem justificativa (R4)', () => {
    const melhora = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.RECEBIDO,
      estadoAnterior: EstadoFisico.RUIM,
      estadoNovo: EstadoFisico.EXCELENTE,
      triagemCompleta: false,
    });
    expect(melhora.valido).toBe(true);
  });

  it('movimentação sem mudança: rejeita quando status e estado físico permanecem iguais (R10)', () => {
    const res = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.RECEBIDO,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(res.valido).toBe(false);
    expect(res.erros[0]?.campo).toBe('movimentacao');
  });

  it('aceita mudança somente de status mantendo o mesmo estado físico (R10)', () => {
    const res = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(res.valido).toBe(true);
  });
});
