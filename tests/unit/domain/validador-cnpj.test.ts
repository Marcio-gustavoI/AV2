import { describe, expect, it } from 'vitest';
import {
  ErroRegraDeNegocio,
  ValidadorCnpj,
  normalizarCnpj,
} from '../../../src/domain/index.js';

describe('ValidadorCnpj (R1 / A1-12)', () => {
  const validador = new ValidadorCnpj();

  it('normaliza CNPJ removendo pontuação e convertendo para maiúsculas', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('aceita CNPJ numérico válido com ou sem máscara', () => {
    expect(validador.validar('11.222.333/0001-81').valido).toBe(true);
    expect(validador.validar('11222333000181').valido).toBe(true);
    expect(validador.validar('11.444.777/0001-61').valido).toBe(true);
  });

  it('aceita CNPJ alfanumérico válido (IN RFB 2.229/2024 - ASCII - 48)', () => {
    // Exemplo oficial SERPRO: 12.ABC.345/01DE-35 -> DV = 35
    expect(validador.validar('12.ABC.345/01DE-35').valido).toBe(true);
    expect(validador.validar('12abc34501de35').valido).toBe(true);
  });

  it('CNPJ inválido: rejeita dígitos verificadores incorretos', () => {
    const res = validador.validar('11.222.333/0001-82');
    expect(res.valido).toBe(false);
    expect(res.erros[0]?.mensagem).toContain('dígitos verificadores');
    expect(() => validador.validarOuFalhar('12.ABC.345/01DE-99')).toThrow(ErroRegraDeNegocio);
  });

  it('CNPJ com dígitos repetidos: rejeita sequências homogêneas', () => {
    for (const seq of [
      '00000000000000',
      '11.111.111/1111-11',
      '22222222222222',
      '99999999999999',
    ]) {
      const res = validador.validar(seq);
      expect(res.valido).toBe(false);
      expect(res.erros[0]?.mensagem).toContain('repetidos');
    }
  });

  it('rejeita tamanho diferente de 14 ou letras nos dígitos verificadores', () => {
    expect(validador.validar('1234567890123').valido).toBe(false);
    expect(validador.validar('123456789012345').valido).toBe(false);
    expect(validador.validar('12ABC34501DEAB').valido).toBe(false);
  });
});
