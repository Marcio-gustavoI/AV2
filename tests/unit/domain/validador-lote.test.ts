import { describe, expect, it } from 'vitest';
import {
  ErroRegraDeNegocio,
  RelogioFixo,
  ValidadorLote,
} from '../../../src/domain/index.js';

describe('ValidadorLote (R2 / A1-13)', () => {
  // 2026-10-21 15:00:00Z = 2026-10-21 12:00:00 em America/Sao_Paulo
  const relogio = new RelogioFixo(new Date('2026-10-21T15:00:00.000Z'));
  const validador = new ValidadorLote(relogio, 'America/Sao_Paulo');

  it('aceita lote com data de hoje', () => {
    expect(validador.validar({ dataEntrada: '2026-10-21' }).valido).toBe(true);
  });

  it('aceita lote com data de ontem', () => {
    expect(validador.validar({ dataEntrada: '2026-10-20' }).valido).toBe(true);
  });

  it('lote data futura: rejeita data de amanhã', () => {
    const res = validador.validar({ dataEntrada: '2026-10-22' });
    expect(res.valido).toBe(false);
    expect(res.erros[0]?.mensagem).toContain('futura');
    expect(() => validador.validarOuFalhar({ dataEntrada: '2026-10-22' })).toThrow(
      ErroRegraDeNegocio,
    );
  });

  it('lote de exatamente 90 dias (aceito): aceita limite exato de 90 dias atrás', () => {
    // 2026-10-21 menos 90 dias = 2026-07-23 (julho tem 31, agosto 31, setembro 30: 8 + 31 + 30 + 21 = 90)
    expect(validador.validar({ dataEntrada: '2026-07-23' }).valido).toBe(true);
  });

  it('lote data de 91 dias: rejeita data com 91 dias atrás', () => {
    const res = validador.validar({ dataEntrada: '2026-07-22' });
    expect(res.valido).toBe(false);
    expect(res.erros[0]?.mensagem).toContain('90 dias');
  });

  it('compara pelo dia de calendário no fuso TZ_NEGOCIO (23:30 em São Paulo ainda é dia 21)', () => {
    // 2026-10-22T02:30:00Z = 2026-10-21T23:30:00-03:00 em America/Sao_Paulo
    const relogioFimDeNoite = new RelogioFixo(new Date('2026-10-22T02:30:00.000Z'));
    const validadorNoite = new ValidadorLote(relogioFimDeNoite, 'America/Sao_Paulo');

    expect(validadorNoite.validar({ dataEntrada: '2026-10-21' }).valido).toBe(true);
    expect(validadorNoite.validar({ dataEntrada: '2026-10-22' }).valido).toBe(false);
  });

  it('rejeita data inválida', () => {
    expect(validador.validar({ dataEntrada: '2026-02-30' }).valido).toBe(false);
    expect(validador.validar({ dataEntrada: 'data-invalida' }).valido).toBe(false);
  });
});
